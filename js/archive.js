/**
 * ====================================================================
 * DATA ARSIP — Supabase (tabel `archives`)
 * ====================================================================
 * Alur:
 * - "Simpan ke Arsip": snapshot data pesanan di-insert ke tabel
 *   `archives`, lalu baris asli di tabel `orders` DIHAPUS (pesanan
 *   benar-benar pindah dari daftar aktif ke arsip).
 * - "Pulihkan": baris arsip di-insert kembali ke tabel `orders`
 *   sebagai pesanan aktif baru, lalu baris di `archives` dihapus.
 * - "Hapus Permanen": baris di tabel `archives` dihapus. Baris asli
 *   di `orders` sudah tidak ada (sudah dihapus saat diarsipkan),
 *   sehingga tidak perlu dihapus lagi.
 * ====================================================================
 */

/**
 * Pindahkan satu pesanan ke tabel archives, lalu hapus dari orders.
 * Mengembalikan true jika berhasil.
 */
async function archiveOrder(order) {
    const { error: insertError } = await supabaseClient
        .from("archives")
        .insert([{
            order_id: order.id,
            dashboard: order.dashboard,
            nomor_pesanan: order.nomor_pesanan,
            tagar: order.tagar,
            nomor_whatsapp: order.nomor_whatsapp || "",
            paket_total: order.paket_total,
            paket_terkirim: order.paket_terkirim,
            keterangan: order.keterangan || "",
            created_at: order.created_at || null
        }]);

    if (insertError) {
        console.error(insertError);
        showToast("Gagal menyimpan ke arsip", "danger");
        return false;
    }

    const { error: deleteError } = await supabaseClient
        .from("orders")
        .delete()
        .eq("id", order.id);

    if (deleteError) {
        console.error(deleteError);
        showToast("Tersimpan ke arsip, tapi gagal dihapus dari daftar aktif", "danger");
        return false;
    }

    return true;
}

/**
 * Jumlah total data arsip (untuk badge di nav).
 */
async function getArchiveCount() {
    const { count, error } = await supabaseClient
        .from("archives")
        .select("*", { count: "exact", head: true });

    if (error) {
        console.error(error);
        return 0;
    }
    return count || 0;
}

/* ---------------- Rendering Halaman Data Arsip ---------------- */

async function renderArchivePage() {
    const grid = document.getElementById("archiveGrid");
    const emptyState = document.getElementById("archiveEmptyState");
    const searchValue = document.getElementById("archiveSearchInput").value.toLowerCase().trim();
    const filterDashboard = document.getElementById("archiveFilterDashboard").value;
    const sortMode = document.getElementById("archiveSort").value;

    emptyState.style.display = "none";

    let query = supabaseClient.from("archives").select("*");

    if (filterDashboard !== "ALL") {
        query = query.eq("dashboard", filterDashboard);
    }

    if (sortMode === "oldest") {
        query = query.order("archived_at", { ascending: true });
    } else if (sortMode === "name") {
        query = query.order("nomor_pesanan", { ascending: true });
    } else {
        query = query.order("archived_at", { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
        console.error(error);
        showToast("Gagal memuat data arsip", "danger");
        return;
    }

    let list = data || [];

    if (searchValue) {
        list = list.filter(a =>
            a.nomor_pesanan.toLowerCase().includes(searchValue) ||
            a.tagar.toLowerCase().includes(searchValue) ||
            (a.nomor_whatsapp || "").toLowerCase().includes(searchValue)
        );
    }

    document.getElementById("archiveCountBadge").innerText = await getArchiveCount();

    if (list.length === 0) {
        grid.innerHTML = "";
        emptyState.style.display = "flex";
        return;
    }

    grid.innerHTML = list.map(a => {
        const status = getOrderStatus(a.paket_terkirim, a.paket_total);
        const percent = Math.min(100, Math.round((a.paket_terkirim / a.paket_total) * 100));

        return `
        <div class="archive-card">
            <div class="archive-card-top">
                <div class="archive-card-title">${escapeHtml(a.nomor_pesanan)}</div>
                <span class="badge badge-archived">🗂️ Diarsipkan</span>
            </div>

            <div class="archive-card-meta">
                <span class="chip">${escapeHtml(a.dashboard)}</span>
                <span class="chip">${escapeHtml(a.tagar)}</span>
                ${a.nomor_whatsapp ? `<span class="chip">${escapeHtml(a.nomor_whatsapp)}</span>` : ""}
            </div>

            <div class="progress-cell">
                <div class="progress-text">H${a.paket_terkirim}/H${a.paket_total} &middot; ${status.label}</div>
                <div class="progress-track">
                    <div class="progress-fill ${status.barClass}" style="width:${percent}%;"></div>
                </div>
            </div>

            <div class="archive-card-dates">
                <span>📅 Dibuat: ${formatDateHuman(a.created_at)}</span>
                <span>🗂️ Diarsipkan: ${formatDateHuman(a.archived_at)}</span>
            </div>

            <div class="archive-card-actions">
                <button type="button" class="btn btn-outline btn-wrap" onclick="handleRestoreArchive(${a.id})">↩️ Pulihkan</button>
                <button type="button" class="btn btn-danger btn-wrap" onclick="handleDeleteArchive(${a.id}, '${escapeHtml(a.nomor_pesanan)}')">🗑 Hapus Permanen</button>
            </div>
        </div>`;
    }).join("");
}

function handleRestoreArchive(archiveId) {
    openConfirmModal({
        icon: "↩️",
        iconClass: "archive",
        title: "Pulihkan Pesanan?",
        body: "Pesanan ini akan dikembalikan ke daftar <b>Pesanan Aktif</b>.",
        confirmText: "Pulihkan",
        confirmClass: "btn-archive",
        onConfirm: async () => {
            const { data, error } = await supabaseClient
                .from("archives")
                .select("*")
                .eq("id", archiveId)
                .single();

            if (error || !data) {
                showToast("Gagal memuat data arsip", "danger");
                return;
            }

            const { error: insertError } = await supabaseClient
                .from("orders")
                .insert([{
                    dashboard: data.dashboard,
                    nomor_pesanan: data.nomor_pesanan,
                    tagar: data.tagar,
                    nomor_whatsapp: data.nomor_whatsapp,
                    paket_total: data.paket_total,
                    paket_terkirim: data.paket_terkirim,
                    last_check_utc: "",
                    keterangan: data.keterangan || ""
                }]);

            if (insertError) {
                console.error(insertError);
                showToast("Gagal memulihkan pesanan", "danger");
                return;
            }

            const { error: deleteError } = await supabaseClient
                .from("archives")
                .delete()
                .eq("id", archiveId);

            if (deleteError) {
                console.error(deleteError);
            }

            renderArchivePage();
            loadData();
            showToast("Pesanan dipulihkan ke daftar aktif", "archive");
        }
    });
}

function handleDeleteArchive(archiveId, nama) {
    openConfirmModal({
        icon: "🗑",
        iconClass: "danger",
        title: "Hapus Permanen?",
        body: `Data <b>${escapeHtml(nama)}</b> akan dihapus permanen dari arsip dan tidak dapat dikembalikan.`,
        confirmText: "Hapus Permanen",
        confirmClass: "btn-danger",
        onConfirm: async () => {
            const { error } = await supabaseClient
                .from("archives")
                .delete()
                .eq("id", archiveId);

            if (error) {
                console.error(error);
                showToast("Gagal menghapus data arsip", "danger");
                return;
            }

            renderArchivePage();
            showToast("Data arsip dihapus permanen", "danger");
        }
    });
}
