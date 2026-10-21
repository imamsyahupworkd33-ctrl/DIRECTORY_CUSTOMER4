const tbody = document.getElementById("tableBody");
const addBtn = document.getElementById("addData");

/* ---------------- Navigasi Halaman (Dashboard Aktif / Data Arsip) ---------------- */
document.querySelectorAll("#pageNav button[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("#pageNav button[data-page]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const page = btn.dataset.page;

        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        document.getElementById(`view-${page}`).classList.add("active");

        if (page === "arsip") {
            renderArchivePage();
        } else if (page === "produk") {
            loadProduk();
        } else if (page === "tagar") {
            loadTagarHistory();
        } else if (page === "akun") {
            initAkunPelangganPage();
        } else if (page === "statistik") {
            loadStatistik();
        } else if (page === "supply") {
            initSupplyPage();
        } else if (page === "pengumuman") {
            initAnnouncePage();
        } else if (page === "havsell") {
            initHavSellPage();
        } else if (page === "farmsell") {
            initFarmSellPage();
        } else if (page === "cashflow") {
            initCashflowPage();
        } else {
            loadData();
        }
    });
});

/* ---------------- Sub-tab Dashboard (BEM / LEM / SEM) ---------------- */
document.querySelectorAll("#dashboardTabs .tab").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("#dashboardTabs .tab").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        currentDashboard = btn.dataset.dashboard;
        loadData();
    });
});

/* ---------------- Sub-tab Produk: Kategori (10 BOX / 9 BOX) ---------------- */
document.querySelectorAll("#produkCategoryTabs .tab").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("#produkCategoryTabs .tab").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        currentKategoriProduk = btn.dataset.kategori;
        loadProduk();
    });
});

/* ---------------- Sub-tab Produk: Dashboard (BEM / LEM / SEM) ---------------- */
document.querySelectorAll("#produkDashboardTabs .tab").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("#produkDashboardTabs .tab").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        currentDashboardProduk = btn.dataset.produkDashboard;
        loadProduk();
    });
});

/* ---------------- Search Produk ---------------- */
document.getElementById("produkSearchInput").addEventListener("input", filterProdukTable);

/* ---------------- Cari Posisi Tagar Akun (lintas semua produk) ---------------- */
document.getElementById("cariTagarPosisiBtn").addEventListener("click", handleCariTagarPosisi);
document.getElementById("cariTagarPosisiInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        handleCariTagarPosisi();
    }
});

/* ---------------- Tambah Produk ---------------- */
document.getElementById("addProduk").addEventListener("click", handleAddProduk);

/* ---------------- Tagar: live preview & proses ---------------- */
document.getElementById("tagarBulkInput").addEventListener("input", updateTagarLivePreview);
document.getElementById("processTagarBtn").addEventListener("click", handleProcessTagar);

/* ---------------- Search & Filter Status ---------------- */
document.getElementById("searchInput").addEventListener("input", filterTable);
document.getElementById("statusFilterSelect").addEventListener("change", filterTable);

/* ---------------- Salin Semua Tagar & Ceklis Semua ---------------- */
document.getElementById("copyAllTagsBtn").addEventListener("click", copyAllTags);
document.getElementById("checkAllBtn").addEventListener("click", checkAllDaily);

document.getElementById("archiveSearchInput").addEventListener("input", renderArchivePage);
document.getElementById("archiveFilterDashboard").addEventListener("change", renderArchivePage);
document.getElementById("archiveSort").addEventListener("change", renderArchivePage);

/* ---------------- Tambah Pesanan ---------------- */
addBtn.addEventListener("click", async () => {
    const nomorPesanan = document.getElementById("orderNumber").value.trim();
    const tagar = document.getElementById("hashtag").value.trim();
    const whatsapp = document.getElementById("whatsapp").value.trim();
    const paket = parseInt(document.getElementById("packageTotal").value);

    if (!nomorPesanan || !tagar || !paket) {
        showToast("Lengkapi data terlebih dahulu", "danger");
        return;
    }

    if (whatsapp && !validWhatsapp(whatsapp)) {
        showToast("Format WA harus diawali tanda +...", "danger");
        return;
    }

    const keterangan = `${currentDashboard} H0/H${paket} | ${tagar} | ${
        whatsapp ? "https://wa.me/" + whatsapp.replace("+", "") : ""
    }`;

    const { error } = await supabaseClient
        .from("orders")
        .insert([{
            dashboard: currentDashboard,
            nomor_pesanan: nomorPesanan,
            tagar: tagar,
            nomor_whatsapp: whatsapp,
            paket_total: paket,
            paket_terkirim: 0,
            last_check_utc: "",
            keterangan: keterangan
        }]);

    if (error) {
        console.error(error);
        showToast("Gagal menambahkan pesanan", "danger");
        return;
    }

    document.getElementById("orderNumber").value = "";
    document.getElementById("hashtag").value = "";
    document.getElementById("whatsapp").value = "";
    document.getElementById("packageTotal").value = "";

    showToast("Pesanan baru berhasil ditambahkan", "success");
    loadData();
});

loadData();
