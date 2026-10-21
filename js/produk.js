/**
 * ====================================================================
 * PRODUK — Supabase (tabel `products`)
 * ====================================================================
 * Struktur: Kategori (Akun 10 BOX / Akun 9 BOX) x Dashboard (BEM/LEM/SEM)
 * Setiap kategori+dashboard bisa berisi banyak "produk" (contoh: batch
 * "NEW BEM VOL 2" dengan kapasitas 100 akun). Tiap produk mencatat:
 * - jumlah_akun   : kapasitas total akun dalam produk tsb
 * - terpakai      : jumlah akun yang sudah dipakai (mis. 24/100)
 * - daftar_error  : daftar tagar/nomor akun yang error (satu per baris)
 * - isi_ulang     : null = belum diputuskan, true = diisi ulang,
 *                   false = tidak diisi ulang (hanya relevan saat penuh)
 * ====================================================================
 */

let currentKategoriProduk = "10BOX";
let currentDashboardProduk = "BEM";

/* ---------------- Status & Helper ---------------- */

function getProdukStatus(item) {
    const total = item.jumlah_akun || 0;
    const used = item.terpakai || 0;

    if (total > 0 && used >= total) {
        if (item.isi_ulang === true) {
            return { label: "Diisi Ulang", badgeClass: "badge-done", icon: "✅", barClass: "done", full: true, decided: true };
        }
        if (item.isi_ulang === false) {
            return { label: "Tidak Diisi Ulang", badgeClass: "badge-archived", icon: "🚫", barClass: "done", full: true, decided: true };
        }
        return { label: "Menunggu Keputusan", badgeClass: "badge-danger", icon: "🔴", barClass: "warn", full: true, decided: false };
    }

    const ratio = total > 0 ? used / total : 0;
    if (ratio >= 0.8) {
        return { label: "Mendekati Limit", badgeClass: "badge-warn", icon: "⚠️", barClass: "warn", full: false, decided: false };
    }
    return { label: "Tersedia", badgeClass: "badge-proses", icon: "⏳", barClass: "ok", full: false, decided: false };
}

/* ---------------- Load & Render ---------------- */

async function loadProduk() {
    const loadingState = document.getElementById("produkLoadingState");
    const emptyState = document.getElementById("produkEmptyState");
    const tableBody = document.getElementById("produkTableBody");

    if (!tableBody) return;

    loadingState.style.display = "flex";
    emptyState.style.display = "none";
    tableBody.innerHTML = "";

    const kategoriLabel = currentKategoriProduk === "10BOX" ? "Akun 10 BOX" : "Akun 9 BOX";
    document.getElementById("produkPanelLabel").innerHTML = `${kategoriLabel} &middot; ${currentDashboardProduk}`;

    const { data, error } = await supabaseClient
        .from("products")
        .select("*")
        .eq("kategori", currentKategoriProduk)
        .eq("dashboard", currentDashboardProduk)
        .order("id", { ascending: true });

    loadingState.style.display = "none";

    if (error) {
        console.error(error);
        showToast("Gagal memuat data produk", "danger");
        return;
    }

    const list = data || [];

    updateProdukStats();

    if (list.length === 0) {
        emptyState.style.display = "flex";
        return;
    }

    tableBody.innerHTML = list.map((item, i) => renderProdukRow(item, i)).join("");

    filterProdukTable();
}

function renderProdukRow(item, i) {
    const total = item.jumlah_akun || 0;
    const used = item.terpakai || 0;
    const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    const status = getProdukStatus(item);

    const errorList = (item.daftar_error || "")
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean);

    const errorHtml = errorList.length > 0
        ? `<div class="error-list-box">${errorList.map(e => escapeHtml(e)).join("<br>")}</div>`
        : `<span style="color:var(--text-muted); font-size:12.5px;">Tidak ada</span>`;

    let decisionBtn = "";
    if (status.full && !status.decided) {
        decisionBtn = `<button type="button" class="btn btn-danger btn-wrap" style="padding:9px 12px; font-size:12px;" onclick="openProdukDecision(${item.id})">⚠️ Tentukan Keputusan</button>`;
    } else if (status.full && status.decided) {
        decisionBtn = `<button type="button" class="btn btn-outline btn-wrap" style="padding:9px 12px; font-size:12px;" onclick="openProdukDecision(${item.id})">🔁 Ubah Keputusan</button>`;
    }

    const tagarParsed = parseTagarList(item.list_tagar);
    const tagarBtnClass = tagarParsed.duplicateCount > 0 ? "btn-danger" : "btn-outline";
    const tagarBtnLabel = tagarParsed.total > 0
        ? `🏷️ ${tagarParsed.total} Tagar${tagarParsed.duplicateCount > 0 ? " ⚠️" : ""}`
        : "🏷️ Isi List Tagar";
    const tagarBtn = `<button type="button" class="btn ${tagarBtnClass} btn-wrap" style="padding:9px 12px; font-size:12px;" onclick="openTagarListModal(${item.id})" title="Kelola List Tagar Akun">${tagarBtnLabel}</button>`;

    return `
        <tr>
            <td data-label="No">${i + 1}</td>
            <td data-label="Nama Produk"><span class="customer-order-num">${i + 1}</span><span class="customer-name">${escapeHtml(item.nama_produk)}</span></td>
            <td data-label="Kapasitas" class="progress-cell">
                <div class="progress-text">${used}/${total}</div>
                <div class="progress-track"><div class="progress-fill ${status.barClass}" style="width:${percent}%;"></div></div>
            </td>
            <td data-label="Tagar Error">${errorHtml}</td>
            <td data-label="Keterangan"><span class="badge ${status.badgeClass}">${status.icon} ${escapeHtml(status.label)}</span></td>
            <td data-label="Aksi">
                <div class="actions-cell">
                    ${decisionBtn}
                    ${tagarBtn}
                    <button type="button" class="btn btn-ghost btn-icon" onclick="editProdukModal(${item.id})" title="Edit Produk">✏️</button>
                    <button type="button" class="btn btn-danger btn-icon" onclick="deleteProduk(${item.id})" title="Hapus Produk">🗑</button>
                </div>
            </td>
        </tr>`;
}

async function updateProdukStats() {
    const { data, error } = await supabaseClient.from("products").select("*");
    if (error || !data) return;

    const total = data.length;
    const totalTerpakai = data.reduce((sum, x) => sum + (x.terpakai || 0), 0);
    const menunggu = data.filter(x => x.jumlah_akun > 0 && x.terpakai >= x.jumlah_akun && x.isi_ulang === null).length;
    const selesai = data.filter(x => x.jumlah_akun > 0 && x.terpakai >= x.jumlah_akun && x.isi_ulang !== null).length;

    document.getElementById("produkTotal").innerText = total;
    document.getElementById("produkTerpakai").innerText = totalTerpakai;
    document.getElementById("produkMenunggu").innerText = menunggu;
    document.getElementById("produkSelesai").innerText = selesai;
}

/* ---------------- Search ---------------- */

function filterProdukTable() {
    const searchInput = document.getElementById("produkSearchInput");
    if (!searchInput) return;

    const value = searchInput.value.toLowerCase();
    const rows = document.querySelectorAll("#produkTableBody tr");
    let visibleCount = 0;

    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        const match = text.includes(value);
        row.style.display = match ? "" : "none";
        if (match) visibleCount++;
    });

    const emptyState = document.getElementById("produkEmptyState");
    if (emptyState && rows.length > 0) {
        emptyState.style.display = (visibleCount === 0) ? "flex" : "none";
    }
}

/* ---------------- Tambah Produk ---------------- */

async function handleAddProduk() {
    const namaInput = document.getElementById("produkNama");
    const jumlahInput = document.getElementById("produkJumlah");

    const nama = namaInput.value.trim();
    const jumlah = parseInt(jumlahInput.value);

    if (!nama || !jumlah || jumlah < 1) {
        showToast("Lengkapi nama produk dan jumlah akun", "danger");
        return;
    }

    const { error } = await supabaseClient
        .from("products")
        .insert([{
            kategori: currentKategoriProduk,
            dashboard: currentDashboardProduk,
            nama_produk: nama,
            jumlah_akun: jumlah,
            terpakai: 0,
            daftar_error: "",
            isi_ulang: null,
            keterangan: ""
        }]);

    if (error) {
        console.error(error);
        showToast("Gagal menambahkan produk", "danger");
        return;
    }

    namaInput.value = "";
    jumlahInput.value = "";

    showToast("Produk baru berhasil ditambahkan", "success");
    loadProduk();
}

/* ---------------- Edit Produk ---------------- */

async function editProdukModal(id) {
    const { data, error } = await supabaseClient
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) {
        showToast("Gagal memuat data produk", "danger");
        return;
    }

    openEditProdukModal(data, async ({ nama, jumlah, terpakai, errorText }) => {
        if (terpakai > jumlah) {
            showToast("Akun terpakai tidak boleh melebihi kapasitas", "danger");
            return;
        }

        // Jika kapasitas direvisi sehingga tidak lagi penuh, reset keputusan isi ulang
        let isiUlang = data.isi_ulang;
        if (terpakai < jumlah) isiUlang = null;

        const { error: updateError } = await supabaseClient
            .from("products")
            .update({
                nama_produk: nama,
                jumlah_akun: jumlah,
                terpakai: terpakai,
                daftar_error: errorText,
                isi_ulang: isiUlang
            })
            .eq("id", id);

        if (updateError) {
            console.error(updateError);
            showToast("Gagal menyimpan perubahan produk", "danger");
            return;
        }

        loadProduk();
        showToast("Perubahan produk disimpan", "success");
    });
}

function openEditProdukModal(produk, onSave) {
    modalBox.innerHTML = `
        <div class="modal-icon info">✏️</div>
        <div class="modal-title">Edit Produk</div>
        <div class="modal-form">
            <div class="field">
                <label for="editProdukNama">Nama Produk / Batch</label>
                <input type="text" id="editProdukNama" value="${escapeHtml(produk.nama_produk)}">
            </div>
            <div class="field">
                <label for="editProdukJumlah">Jumlah Akun (Kapasitas)</label>
                <input type="number" id="editProdukJumlah" min="1" value="${escapeHtml(produk.jumlah_akun)}">
            </div>
            <div class="field">
                <label for="editProdukTerpakai">Akun Sudah Terpakai</label>
                <input type="number" id="editProdukTerpakai" min="0" value="${escapeHtml(produk.terpakai)}">
            </div>
            <div class="field">
                <label for="editProdukError">Daftar Tagar/Nomor Akun Error (satu per baris)</label>
                <textarea id="editProdukError" rows="4" placeholder="cth.&#10;#tagar01&#10;#tagar07">${escapeHtml(produk.daftar_error || "")}</textarea>
            </div>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost btn-wrap" id="modalCancelBtn">Batal</button>
            <button type="button" class="btn btn-primary btn-wrap" id="modalSaveBtn">Simpan Perubahan</button>
        </div>
    `;

    modalOverlay.classList.add("show");

    document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
    document.getElementById("modalSaveBtn").addEventListener("click", () => {
        const nama = document.getElementById("editProdukNama").value.trim();
        const jumlah = parseInt(document.getElementById("editProdukJumlah").value);
        const terpakai = parseInt(document.getElementById("editProdukTerpakai").value);
        const errorText = document.getElementById("editProdukError").value.trim();

        if (!nama || !jumlah || jumlah < 1 || isNaN(terpakai) || terpakai < 0) {
            showToast("Lengkapi semua data dengan benar", "danger");
            return;
        }

        onSave({ nama, jumlah, terpakai, errorText });
        closeModal();
    });
}

/* ---------------- Hapus Produk ---------------- */

function deleteProduk(id) {
    openConfirmModal({
        icon: "🗑",
        iconClass: "danger",
        title: "Hapus Produk?",
        body: "Tindakan ini akan menghapus data produk secara permanen dan tidak dapat dibatalkan.",
        confirmText: "Ya, Hapus",
        confirmClass: "btn-danger",
        onConfirm: async () => {
            const { error } = await supabaseClient.from("products").delete().eq("id", id);
            if (error) {
                console.error(error);
                showToast("Gagal menghapus produk", "danger");
                return;
            }
            loadProduk();
            showToast("Produk berhasil dihapus", "danger");
        }
    });
}

/* ---------------- Keputusan Isi Ulang (saat 100/100) ---------------- */
/**
 * Alur 2 langkah sesuai permintaan: (1) centang kotak konfirmasi lalu
 * pilih Isi Ulang / Tidak Diisi Ulang, (2) konfirmasi ulang di modal
 * kedua sebelum keputusan benar-benar disimpan ke database.
 */
async function openProdukDecision(id) {
    const { data, error } = await supabaseClient
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) {
        showToast("Gagal memuat data produk", "danger");
        return;
    }

    if (!(data.jumlah_akun > 0 && data.terpakai >= data.jumlah_akun)) {
        showToast("Produk belum mencapai kapasitas penuh", "danger");
        return;
    }

    modalBox.innerHTML = `
        <div class="modal-icon danger">🔴</div>
        <div class="modal-title">Kapasitas Produk Penuh</div>
        <div class="modal-body">
            Produk <b>${escapeHtml(data.nama_produk)}</b> sudah mencapai <b>${data.terpakai}/${data.jumlah_akun}</b> akun.
            Tentukan apakah produk ini akan <b>diisi ulang</b> atau <b>tidak diisi ulang</b>.
        </div>
        <label class="decision-confirm-row" for="decisionConfirmCheck">
            <input type="checkbox" id="decisionConfirmCheck">
            <span>Saya yakin dengan keputusan yang akan saya pilih</span>
        </label>
        <div class="modal-actions" style="margin-top:14px;">
            <button type="button" class="btn btn-danger btn-wrap" id="decisionNoBtn" disabled>🚫 Tidak Diisi Ulang</button>
            <button type="button" class="btn btn-success btn-wrap" id="decisionYesBtn" disabled>🔄 Isi Ulang</button>
        </div>
        <button type="button" class="btn btn-ghost" id="modalCancelBtn" style="width:100%; margin-top:10px;">Batal</button>
    `;

    modalOverlay.classList.add("show");

    const checkbox = document.getElementById("decisionConfirmCheck");
    const yesBtn = document.getElementById("decisionYesBtn");
    const noBtn = document.getElementById("decisionNoBtn");

    checkbox.addEventListener("change", () => {
        yesBtn.disabled = !checkbox.checked;
        noBtn.disabled = !checkbox.checked;
    });

    document.getElementById("modalCancelBtn").addEventListener("click", closeModal);

    yesBtn.addEventListener("click", () => {
        closeModal();
        confirmProdukDecision(data, true);
    });

    noBtn.addEventListener("click", () => {
        closeModal();
        confirmProdukDecision(data, false);
    });
}

function confirmProdukDecision(produk, isiUlang) {
    openConfirmModal({
        icon: isiUlang ? "🔄" : "🚫",
        iconClass: isiUlang ? "success" : "danger",
        title: "Konfirmasi Ulang Keputusan",
        body: `Anda memilih <b>${isiUlang ? "Isi Ulang" : "Tidak Diisi Ulang"}</b> untuk produk <b>${escapeHtml(produk.nama_produk)}</b>. Pastikan keputusan ini sudah benar sebelum disimpan.`,
        confirmText: "Ya, Simpan Keputusan",
        confirmClass: isiUlang ? "btn-success" : "btn-danger",
        onConfirm: async () => {
            const keterangan = isiUlang ? "Akun diisi ulang" : "Akun tidak diisi ulang";

            const { error } = await supabaseClient
                .from("products")
                .update({ isi_ulang: isiUlang, keterangan: keterangan })
                .eq("id", produk.id);

            if (error) {
                console.error(error);
                showToast("Gagal menyimpan keputusan", "danger");
                return;
            }

            loadProduk();
            showToast(`Keputusan disimpan: ${keterangan}`, isiUlang ? "success" : "danger");
        }
    });
}

/* ---------------- List Tagar Akun (per produk) ---------------- */
/**
 * Daftar tagar akun TIDAK ditampilkan langsung di tabel — hanya angka
 * ringkasannya. Detail penuh (input, hitung otomatis, deteksi duplikat,
 * salin semua) baru muncul saat tombol "🏷️" di baris produk diklik.
 * Duplikat dicek hanya di dalam list milik produk itu sendiri (bukan
 * lintas produk lain), sesuai case-insensitive & baris kosong diabaikan.
 */

/**
 * Memecah teks textarea (satu tagar per baris) menjadi statistik:
 * total baris terisi, jumlah tagar unik, jumlah baris duplikat, dan
 * rincian tagar mana saja yang duplikat beserta berapa kali muncul.
 */
function parseTagarList(rawText) {
    const lines = (rawText || "")
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean);

    const countMap = new Map();
    const firstSeen = new Map();

    lines.forEach(t => {
        const key = t.toLowerCase();
        countMap.set(key, (countMap.get(key) || 0) + 1);
        if (!firstSeen.has(key)) firstSeen.set(key, t);
    });

    const duplicates = [];
    countMap.forEach((count, key) => {
        if (count > 1) duplicates.push({ tagar: firstSeen.get(key), count });
    });
    duplicates.sort((a, b) => b.count - a.count);

    return {
        list: lines,
        total: lines.length,
        uniqueCount: countMap.size,
        duplicateCount: lines.length - countMap.size,
        duplicates
    };
}

/* ====================================================================
 * MODAL: List Tagar Akun — Mode Cepat (wizard isi berurutan) & Mode
 * Daftar (lihat + edit satu per satu). Data tetap disimpan sebagai teks
 * satu tagar per baris di kolom `products.list_tagar` — tidak perlu
 * perubahan skema database.
 * ==================================================================== */

let tagarModalProductId = null;
let tagarModalCapacity = 0;
let tagarModalArray = [];   // tagarModalArray[0] = Akun 1, [1] = Akun 2, dst — selalu rapat tanpa celah
let tagarModalWizardPos = 0; // posisi (0-based) slot yang sedang diisi/diedit di Mode Cepat

async function openTagarListModal(id, focusIndex = null) {
    const { data, error } = await supabaseClient
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) {
        showToast("Gagal memuat data produk", "danger");
        return;
    }

    tagarModalProductId = id;
    tagarModalCapacity = data.jumlah_akun || 0;
    tagarModalArray = parseTagarList(data.list_tagar).list.slice();
    tagarModalWizardPos = tagarModalArray.length; // mulai dari slot kosong berikutnya

    modalBox.innerHTML = `
        <div class="modal-icon info">🏷️</div>
        <div class="modal-title">List Tagar Akun</div>
        <div class="modal-body" style="margin-bottom:14px;">
            Produk: <b>${escapeHtml(data.nama_produk)}</b>. Isi berurutan lewat Mode Cepat (tempel & lanjut
            otomatis ke akun berikutnya), atau buka Mode Daftar untuk mengedit tagar akun tertentu satu per satu.
        </div>

        <div class="tagwizard-tabs">
            <button type="button" class="tagwizard-tab active" data-mode="cepat">⚡ Mode Cepat</button>
            <button type="button" class="tagwizard-tab" data-mode="daftar">📋 Daftar &amp; Edit</button>
        </div>

        <div id="tagwizardCepatPane">
            <div class="tagwizard-progress-text" id="tagwizardProgressText">Mengisi Tagar Akun 1</div>
            <div class="progress-track"><div class="progress-fill" id="tagwizardProgressBar" style="width:0%;"></div></div>

            <div class="field" style="margin-top:14px;">
                <label id="tagwizardLabel" for="tagwizardInput">Tempel Tagar Akun 1</label>
                <input type="text" id="tagwizardInput" placeholder="Tempel tagar di sini, lalu tekan Enter atau klik Lanjut" autocomplete="off">
            </div>

            <div class="modal-actions" style="margin-top:14px;">
                <button type="button" class="btn btn-ghost btn-wrap" id="tagwizardBackBtn">◀ Sebelumnya</button>
                <button type="button" class="btn btn-primary btn-wrap" id="tagwizardNextBtn">Lanjut ▶</button>
            </div>
            <button type="button" class="btn btn-outline" id="tagwizardFinishBtn" style="width:100%; margin-top:10px;">✅ Selesai, Lihat Daftar</button>
        </div>

        <div id="tagwizardDaftarPane" style="display:none;">
            <div class="tagar-stats-row">
                <span class="chip chip-info" id="tagarStatTotal">Total Tagar: 0</span>
                <span class="chip chip-success" id="tagarStatDuplikat">Tidak Ada Duplikat</span>
            </div>
            <div id="tagarDuplikatBox"></div>

            <div id="tagarDirectoryList" class="tagar-directory-list"></div>

            <div class="field" style="margin-top:12px;">
                <label for="tagarAddNewInput">Tambah Tagar Baru di Akhir Urutan</label>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="tagarAddNewInput" placeholder="Tempel tagar baru di sini" style="flex:1;">
                    <button type="button" class="btn btn-outline" id="tagarAddNewBtn">+ Tambah</button>
                </div>
            </div>

            <button type="button" class="btn btn-outline btn-wrap" id="copyTagarListBtn" style="width:100%; margin-top:10px;">📋 Salin Semua Tagar</button>
            <button type="button" class="btn btn-danger btn-wrap" id="deleteAllTagarBtn" style="width:100%; margin-top:8px;">🗑 Hapus Semua Tagar</button>
        </div>

        <button type="button" class="btn btn-ghost" id="modalCancelBtn" style="width:100%; margin-top:14px;">Tutup</button>
    `;

    modalOverlay.classList.add("show");

    document.getElementById("modalCancelBtn").addEventListener("click", closeModal);

    document.querySelectorAll(".tagwizard-tab").forEach(btn => {
        btn.addEventListener("click", () => switchTagwizardTab(btn.dataset.mode));
    });

    document.getElementById("tagwizardNextBtn").addEventListener("click", commitWizardNext);
    document.getElementById("tagwizardBackBtn").addEventListener("click", () => {
        if (tagarModalWizardPos > 0) {
            tagarModalWizardPos--;
            updateWizardUI();
        }
    });
    document.getElementById("tagwizardInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            commitWizardNext();
        }
    });
    document.getElementById("tagwizardFinishBtn").addEventListener("click", () => switchTagwizardTab("daftar"));

    document.getElementById("tagarAddNewBtn").addEventListener("click", handleAddTagarAtEnd);
    document.getElementById("tagarAddNewInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAddTagarAtEnd();
        }
    });

    document.getElementById("copyTagarListBtn").addEventListener("click", async () => {
        if (tagarModalArray.length === 0) {
            showToast("Belum ada tagar untuk disalin", "danger");
            return;
        }
        try {
            await navigator.clipboard.writeText(tagarModalArray.join("\n"));
            showToast(`${tagarModalArray.length} tagar berhasil disalin`, "success");
        } catch (err) {
            console.error(err);
            showToast("Gagal menyalin tagar", "danger");
        }
    });

    document.getElementById("deleteAllTagarBtn").addEventListener("click", openDeleteAllTagarConfirm);

    updateWizardUI();

    if (focusIndex !== null && focusIndex >= 0) {
        switchTagwizardTab("daftar");
        setTimeout(() => highlightTagarRow(focusIndex), 60);
    }
}

function highlightTagarRow(i) {
    const row = document.querySelectorAll("#tagarDirectoryList .tagar-directory-row")[i];
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("tagar-directory-row-highlight");
    setTimeout(() => row.classList.remove("tagar-directory-row-highlight"), 2200);
}

function switchTagwizardTab(mode) {
    document.querySelectorAll(".tagwizard-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === mode));
    document.getElementById("tagwizardCepatPane").style.display = mode === "cepat" ? "block" : "none";
    document.getElementById("tagwizardDaftarPane").style.display = mode === "daftar" ? "block" : "none";

    if (mode === "cepat") {
        tagarModalWizardPos = Math.min(tagarModalWizardPos, tagarModalArray.length);
        updateWizardUI();
    } else {
        renderTagarDirectory();
    }
}

/* ---------------- Mode Cepat (wizard) ---------------- */

function updateWizardUI() {
    const posDisplay = tagarModalWizardPos + 1;
    const cap = tagarModalCapacity > 0 ? tagarModalCapacity : Math.max(tagarModalArray.length + 1, posDisplay);

    const progressText = document.getElementById("tagwizardProgressText");
    const label = document.getElementById("tagwizardLabel");
    const bar = document.getElementById("tagwizardProgressBar");
    const input = document.getElementById("tagwizardInput");
    const backBtn = document.getElementById("tagwizardBackBtn");

    if (tagarModalCapacity > 0 && tagarModalWizardPos >= tagarModalCapacity && tagarModalWizardPos >= tagarModalArray.length) {
        progressText.innerText = `Semua ${tagarModalCapacity} slot tagar sudah pernah terisi 🎉 — bisa tambah lagi atau klik Selesai.`;
    } else {
        progressText.innerText = `Mengisi Tagar Akun ${posDisplay}${tagarModalCapacity > 0 ? ` dari ${cap}` : ""}`;
    }
    label.innerText = `Tempel Tagar Akun ${posDisplay}`;

    const pct = cap > 0 ? Math.min(100, Math.round((tagarModalWizardPos / cap) * 100)) : 0;
    bar.style.width = pct + "%";

    input.value = tagarModalArray[tagarModalWizardPos] || "";
    backBtn.disabled = tagarModalWizardPos <= 0;
    input.focus();
}

async function commitWizardNext() {
    const input = document.getElementById("tagwizardInput");
    const value = input.value.trim();

    if (!value) {
        showToast('Isi tagar dulu, atau klik "Selesai, Lihat Daftar" untuk berhenti mengisi', "danger");
        return;
    }

    if (tagarModalWizardPos < tagarModalArray.length) {
        tagarModalArray[tagarModalWizardPos] = value; // memperbaiki slot yang sudah ada
    } else {
        tagarModalArray.push(value); // slot baru, urutan tetap rapat
    }

    await persistTagarArray();
    tagarModalWizardPos++;

    if (tagarModalCapacity > 0 && tagarModalWizardPos >= tagarModalCapacity) {
        showToast(`Semua ${tagarModalCapacity} tagar akun sudah terisi 🎉`, "success");
        switchTagwizardTab("daftar");
        return;
    }

    updateWizardUI();
}

/* ---------------- Mode Daftar & Edit ---------------- */

function renderTagarDirectory() {
    const container = document.getElementById("tagarDirectoryList");
    if (!container) return;

    if (tagarModalArray.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">Belum ada tagar akun. Pakai Mode Cepat untuk mulai mengisi.</div>`;
    } else {
        container.innerHTML = tagarModalArray.map((tag, i) => `
            <div class="tagar-directory-row">
                <span class="tagar-directory-num">#${i + 1}</span>
                <span class="tagar-directory-text" id="tagarRowText-${i}">${escapeHtml(tag)}</span>
                <input type="text" class="tagar-directory-input" id="tagarRowInput-${i}" value="${escapeHtml(tag)}" style="display:none;">
                <div class="tagar-directory-actions">
                    <button type="button" class="btn btn-ghost btn-icon" id="tagarEditBtn-${i}" onclick="startEditTagarRow(${i})" title="Edit Tagar Akun ${i + 1}">✏️</button>
                    <button type="button" class="btn btn-primary btn-icon" id="tagarSaveBtn-${i}" onclick="saveEditTagarRow(${i})" style="display:none;" title="Simpan">💾</button>
                    <button type="button" class="btn btn-danger btn-icon" onclick="deleteTagarRow(${i})" title="Hapus Tagar Akun ${i + 1}">🗑</button>
                </div>
            </div>
        `).join("");
    }

    updateTagarDirectoryStats();
}

function startEditTagarRow(i) {
    document.getElementById(`tagarRowText-${i}`).style.display = "none";
    document.getElementById(`tagarRowInput-${i}`).style.display = "inline-block";
    document.getElementById(`tagarEditBtn-${i}`).style.display = "none";
    document.getElementById(`tagarSaveBtn-${i}`).style.display = "inline-flex";
    const input = document.getElementById(`tagarRowInput-${i}`);
    input.focus();
    input.addEventListener("keydown", function onKey(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            saveEditTagarRow(i);
            input.removeEventListener("keydown", onKey);
        }
    });
}

async function saveEditTagarRow(i) {
    const input = document.getElementById(`tagarRowInput-${i}`);
    const value = input.value.trim();

    if (!value) {
        showToast("Tagar tidak boleh kosong — hapus barisnya kalau memang ingin dihilangkan", "danger");
        return;
    }

    tagarModalArray[i] = value;
    await persistTagarArray();
    renderTagarDirectory();
    showToast(`Tagar Akun ${i + 1} disimpan`, "success");
}

async function deleteTagarRow(i) {
    openConfirmModal({
        icon: "🗑",
        iconClass: "danger",
        title: `Hapus Tagar Akun ${i + 1}?`,
        body: "Baris di bawahnya akan otomatis naik satu nomor supaya urutan tetap rapi tanpa celah.",
        confirmText: "Ya, Hapus",
        confirmClass: "btn-danger",
        onConfirm: async () => {
            tagarModalArray.splice(i, 1);
            await persistTagarArray();
            renderTagarDirectory();
            showToast("Tagar dihapus, urutan otomatis dirapikan", "danger");
        }
    });
}

async function handleAddTagarAtEnd() {
    const input = document.getElementById("tagarAddNewInput");
    const value = input.value.trim();

    if (!value) {
        showToast("Isi tagar terlebih dahulu", "danger");
        return;
    }

    tagarModalArray.push(value);
    await persistTagarArray();
    input.value = "";
    tagarModalWizardPos = tagarModalArray.length;
    renderTagarDirectory();
    showToast(`Tagar Akun ${tagarModalArray.length} ditambahkan`, "success");
}

function updateTagarDirectoryStats() {
    const parsed = parseTagarList(tagarModalArray.join("\n"));

    const totalEl = document.getElementById("tagarStatTotal");
    if (totalEl) totalEl.innerText = `Total Tagar: ${parsed.total}`;

    const dupEl = document.getElementById("tagarStatDuplikat");
    if (dupEl) {
        if (parsed.duplicateCount > 0) {
            dupEl.className = "chip chip-danger";
            dupEl.innerText = `⚠️ ${parsed.duplicateCount} Baris Duplikat`;
        } else {
            dupEl.className = "chip chip-success";
            dupEl.innerText = "✅ Tidak Ada Duplikat";
        }
    }

    const box = document.getElementById("tagarDuplikatBox");
    if (box) {
        box.innerHTML = parsed.duplicates.length > 0
            ? `<div class="error-list-box" style="max-width:none; margin-top:10px;">${parsed.duplicates.map(d => `${escapeHtml(d.tagar)} <b>(${d.count}x)</b>`).join("<br>")}</div>`
            : "";
    }
}

/* ---------------- Simpan ke Supabase ---------------- */

async function persistTagarArray() {
    const text = tagarModalArray.map(t => t.trim()).filter(Boolean).join("\n");

    const { error } = await supabaseClient
        .from("products")
        .update({ list_tagar: text })
        .eq("id", tagarModalProductId);

    if (error) {
        console.error(error);
        showToast("Gagal menyimpan tagar ke database", "danger");
        return;
    }

    loadProduk();
}

/* ====================================================================
 * CARI POSISI TAGAR — pencarian lintas SEMUA produk (semua kategori &
 * dashboard sekaligus), untuk menjawab "tagar ini ada di produk mana
 * dan akun urutan ke berapa?"
 * ==================================================================== */

async function handleCariTagarPosisi() {
    const input = document.getElementById("cariTagarPosisiInput");
    const resultBox = document.getElementById("cariTagarPosisiResult");
    const rawQuery = input.value.trim();
    const query = rawQuery.toLowerCase();

    if (!query) {
        showToast("Isi dulu tagar yang ingin dicari", "danger");
        return;
    }

    resultBox.innerHTML = `<div class="state-block" style="padding:20px 10px;"><div class="spinner"></div></div>`;

    const { data, error } = await supabaseClient
        .from("products")
        .select("id, nama_produk, kategori, dashboard, list_tagar");

    if (error) {
        console.error(error);
        resultBox.innerHTML = "";
        showToast("Gagal mencari tagar", "danger");
        return;
    }

    const matches = [];

    (data || []).forEach(produk => {
        const lines = parseTagarList(produk.list_tagar).list;
        lines.forEach((tagar, idx) => {
            if (tagar.toLowerCase().includes(query)) {
                matches.push({
                    produkId: produk.id,
                    namaProduk: produk.nama_produk,
                    kategori: produk.kategori,
                    dashboard: produk.dashboard,
                    posisi: idx + 1,
                    tagar
                });
            }
        });
    });

    if (matches.length === 0) {
        resultBox.innerHTML = `
            <div class="state-block" style="padding:24px 10px;">
                <div class="state-icon">🔍</div>
                <div class="state-title">Tidak ditemukan</div>
                <div class="state-sub">Tidak ada tagar yang cocok dengan "${escapeHtml(rawQuery)}" di produk manapun.</div>
            </div>`;
        return;
    }

    const kategoriLabel = k => k === "10BOX" ? "Akun 10 BOX" : "Akun 9 BOX";

    resultBox.innerHTML = `
        <div style="font-size:12.5px; color:var(--text-secondary); margin-bottom:10px;">
            Ditemukan <b>${matches.length}</b> hasil untuk "${escapeHtml(rawQuery)}":
        </div>
        <div class="tagar-directory-list" style="max-height:360px;">
            ${matches.map(m => `
                <div class="tagar-directory-row">
                    <span class="tagar-directory-num">#${m.posisi}</span>
                    <span class="tagar-directory-text">
                        <b>${escapeHtml(m.tagar)}</b><br>
                        <span style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(m.namaProduk)} &middot; ${kategoriLabel(m.kategori)} &middot; ${escapeHtml(m.dashboard)}</span>
                    </span>
                    <div class="tagar-directory-actions">
                        <button type="button" class="btn btn-outline btn-wrap" style="padding:8px 12px; font-size:12px;" onclick="openTagarListModal(${m.produkId}, ${m.posisi - 1})">✏️ Buka &amp; Edit</button>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}


/* ---------------- Hapus SEMUA tagar (dengan konfirmasi ketik HAPUS) ---------------- */

function openDeleteAllTagarConfirm() {
    const total = tagarModalArray.length;

    if (total === 0) {
        showToast("Tidak ada tagar untuk dihapus", "danger");
        return;
    }

    const productId = tagarModalProductId;

    modalBox.innerHTML = `
        <div class="modal-icon danger">⚠️</div>
        <div class="modal-title">Hapus SEMUA Tagar?</div>
        <div class="modal-body">
            Anda akan menghapus <b>${total} tagar</b> dari list produk ini sekaligus.
            Tindakan ini <b>tidak bisa dibatalkan</b>. Untuk melanjutkan, ketik
            <b>HAPUS</b> pada kolom di bawah.
        </div>
        <div class="modal-form">
            <div class="field">
                <label for="deleteAllConfirmInput">Ketik HAPUS untuk konfirmasi</label>
                <input type="text" id="deleteAllConfirmInput" placeholder="HAPUS" autocomplete="off">
            </div>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost btn-wrap" id="deleteAllCancelBtn">Batal</button>
            <button type="button" class="btn btn-danger btn-wrap" id="deleteAllConfirmBtn" disabled style="opacity:.5; cursor:not-allowed;">Ya, Hapus Semua</button>
        </div>
    `;
    modalOverlay.classList.add("show");

    const input = document.getElementById("deleteAllConfirmInput");
    const confirmBtn = document.getElementById("deleteAllConfirmBtn");
    input.focus();

    input.addEventListener("input", () => {
        const ok = input.value.trim() === "HAPUS";
        confirmBtn.disabled = !ok;
        confirmBtn.style.opacity = ok ? "1" : ".5";
        confirmBtn.style.cursor = ok ? "pointer" : "not-allowed";
    });

    // Batal -> kembali ke modal List Tagar (tidak ada yang berubah)
    document.getElementById("deleteAllCancelBtn").addEventListener("click", () => {
        openTagarListModal(productId);
    });

    confirmBtn.addEventListener("click", async () => {
        if (input.value.trim() !== "HAPUS") return;

        tagarModalArray = [];
        tagarModalWizardPos = 0;
        await persistTagarArray();

        showToast(`${total} tagar berhasil dihapus semua`, "danger");
        openTagarListModal(productId);
    });
}
