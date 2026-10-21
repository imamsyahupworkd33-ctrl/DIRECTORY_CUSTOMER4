async function checkDaily(id) {
    const todayUTC = getUTCDate();

    const { data, error } = await supabaseClient
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) {
        showToast("Gagal memuat data pesanan", "danger");
        return;
    }

    if (data.paket_terkirim >= data.paket_total) {
        showToast("Paket sudah mencapai limit — simpan ke arsip atau hapus", "danger");
        return;
    }

    if (data.last_check_utc === todayUTC) {
        showToast("Pengiriman hari ini sudah dicentang", "danger");
        return;
    }

    let terkirim = data.paket_terkirim + 1;
    if (terkirim > data.paket_total) terkirim = data.paket_total;

    const paketBaru = `H${terkirim}/H${data.paket_total}`;
    const wa = data.nomor_whatsapp ? `https://wa.me/${data.nomor_whatsapp.replace("+", "")}` : "";
    const keterangan = `${data.dashboard} ${paketBaru} | ${data.tagar}${wa ? " | " + wa : ""}`;

    await supabaseClient
        .from("orders")
        .update({
            paket_terkirim: terkirim,
            last_check_utc: todayUTC,
            keterangan: keterangan
        })
        .eq("id", id);

    showToast(`Pengiriman hari ini dicatat (${paketBaru})`, "success");
    loadData();
}

/**
 * Mencentang pengiriman hari ini untuk SEMUA pesanan aktif di dashboard
 * yang sedang dibuka (satu klik). Pesanan yang sudah mencapai limit atau
 * yang sudah dicentang hari ini otomatis dilewati.
 */
async function checkAllDaily() {
    const todayUTC = getUTCDate();

    const { data, error } = await supabaseClient
        .from("orders")
        .select("*")
        .eq("dashboard", currentDashboard);

    if (error || !data) {
        showToast("Gagal memuat data pesanan", "danger");
        return;
    }

    // hanya baris yang SEDANG TAMPIL (menghormati search & filter status)
    const visibleIds = new Set(getVisibleOrderIds());
    const searchVal = document.getElementById("searchInput").value.trim();
    const statusVal = document.getElementById("statusFilterSelect").value;
    const filtered = searchVal !== "" || statusVal !== "semua";

    const eligible = data.filter(item =>
        visibleIds.has(item.id) &&
        item.paket_terkirim < item.paket_total && item.last_check_utc !== todayUTC
    );

    if (eligible.length === 0) {
        showToast(filtered ? "Tidak ada pesanan hasil filter yang perlu dicentang hari ini" : "Tidak ada pesanan yang perlu dicentang hari ini", "danger");
        return;
    }

    openConfirmModal({
        icon: "✅",
        iconClass: "success",
        title: "Ceklis Semua Pesanan?",
        body: `Pengiriman hari ini akan dicatat untuk <b>${eligible.length} pesanan</b> di dashboard <b>${currentDashboard}</b> yang belum dicentang${filtered ? ` — <b>hanya yang tampil pada hasil filter${searchVal ? ` “${escapeHtml(searchVal)}”` : ""}</b>, pesanan lain tidak diubah` : ""}. Pesanan yang sudah mencapai limit atau sudah dicentang hari ini akan otomatis dilewati.`,
        confirmText: `Ya, Ceklis ${eligible.length} Pesanan`,
        confirmClass: "btn-success",
        onConfirm: async () => {
            const results = await Promise.allSettled(eligible.map(item => {
                let terkirim = item.paket_terkirim + 1;
                if (terkirim > item.paket_total) terkirim = item.paket_total;

                const paketBaru = `H${terkirim}/H${item.paket_total}`;
                const wa = item.nomor_whatsapp ? `https://wa.me/${item.nomor_whatsapp.replace("+", "")}` : "";
                const keterangan = `${item.dashboard} ${paketBaru} | ${item.tagar}${wa ? " | " + wa : ""}`;

                return supabaseClient
                    .from("orders")
                    .update({
                        paket_terkirim: terkirim,
                        last_check_utc: todayUTC,
                        keterangan: keterangan
                    })
                    .eq("id", item.id);
            }));

            const failed = results.filter(r => r.status === "rejected").length;
            const success = eligible.length - failed;

            if (failed > 0) {
                showToast(`${success} pesanan dicentang, ${failed} gagal`, "danger");
            } else {
                showToast(`${success} pesanan berhasil dicentang hari ini`, "success");
            }

            loadData();
        }
    });
}

async function resetDailyUTC() {
    const todayUTC = getUTCDate();

    const { data } = await supabaseClient.from("orders").select("*");
    if (!data) return;

    for (const item of data) {
        if (item.last_check_utc !== todayUTC) {
            await supabaseClient
                .from("orders")
                .update({ keterangan: "" })
                .eq("id", item.id);
        }
    }
}

// cek pergantian hari UTC setiap 1 menit
setInterval(resetDailyUTC, 60000);
