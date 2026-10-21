/**
 * Menu "Akun Pelanggan" — dipakai admin untuk membuat & mengelola akun
 * login pelanggan (portal terpisah di folder /pelanggan), yang otomatis
 * terhubung ke nama pemesan di tabel `orders` (Dashboard Aktif BEM/LEM/SEM).
 *
 * Semua aksi di sini lewat Postgres function (RPC) yang meminta PIN admin,
 * lihat sql/customer_portal.sql.
 */

let akunAdminPin = sessionStorage.getItem("akun_admin_pin") || null;
let akunPageInited = false;
let cachedAkunAccounts = [];

// Harus sama persis logikanya dengan normalize_pelanggan_name() di SQL,
// supaya "Pelanggan 88" dan "88" tetap dianggap satu pelanggan yang sama.
function normalizePelangganName(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/pelanggan/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

function initAkunPelangganPage() {
    if (akunAdminPin) {
        showAkunContent();
    } else {
        document.getElementById("akunPinGate").style.display = "block";
        document.getElementById("akunContent").style.display = "none";
    }

    if (!akunPageInited) {
        akunPageInited = true;
        bindAkunPelangganEvents();
    }
}

function bindAkunPelangganEvents() {
    document.getElementById("akunPinSubmit").addEventListener("click", async () => {
        const pin = document.getElementById("akunPinInput").value;
        if (!pin) {
            showToast("Masukkan PIN admin", "danger");
            return;
        }
        const { data, error } = await supabaseClient.rpc("admin_verify_pin", { p_pin: pin });

        if (error) {
            // Bukan PIN salah, tapi masalah database/SQL (mis. SQL belum
            // dijalankan, atau pgcrypto tidak ditemukan). Tampilkan apa
            // adanya supaya mudah didiagnosa.
            console.error(error);
            showToast("Error database: " + (error.message || "tidak diketahui"), "danger");
            return;
        }
        if (!data) {
            showToast("PIN admin salah", "danger");
            return;
        }
        akunAdminPin = pin;
        sessionStorage.setItem("akun_admin_pin", pin);
        document.getElementById("akunPinInput").value = "";
        showAkunContent();
    });

    document.getElementById("akunPilihPelanggan").addEventListener("change", (e) => {
        const opt = e.target.selectedOptions[0];
        if (!opt || !opt.value) return;
        document.getElementById("akunMatchSource").value = opt.dataset.nomor || "";
        document.getElementById("akunUsername").value = opt.dataset.nomor || "";
        document.getElementById("akunWhatsapp").value = opt.dataset.wa || "";
    });

    document.getElementById("akunGeneratePw").addEventListener("click", () => {
        document.getElementById("akunPassword").value = generateRandomPassword();
    });

    document.getElementById("akunBuatBtn").addEventListener("click", handleBuatAkun);

    document.getElementById("akunSearchInput").addEventListener("input", filterAkunTable);

    document.getElementById("akunGantiPinBtn").addEventListener("click", async () => {
        const lama = document.getElementById("akunPinLama").value;
        const baru = document.getElementById("akunPinBaru").value;
        if (!lama || !baru) {
            showToast("Isi PIN lama dan PIN baru", "danger");
            return;
        }
        if (baru.length < 4) {
            showToast("PIN baru minimal 4 karakter", "danger");
            return;
        }
        const { data, error } = await supabaseClient.rpc("admin_change_pin", {
            p_old_pin: lama,
            p_new_pin: baru
        });
        if (error || !data) {
            showToast(error?.message || "Gagal mengganti PIN, cek PIN lama Anda", "danger");
            return;
        }
        akunAdminPin = baru;
        sessionStorage.setItem("akun_admin_pin", baru);
        document.getElementById("akunPinLama").value = "";
        document.getElementById("akunPinBaru").value = "";
        showToast("PIN admin berhasil diganti", "success");
    });
}

async function showAkunContent() {
    document.getElementById("akunPinGate").style.display = "none";
    document.getElementById("akunContent").style.display = "block";
    await loadAkunAccounts();       // isi cachedAkunAccounts dulu
    await loadUnlinkedCustomers();  // baru hitung pelanggan yang belum punya akun
}

function generateRandomPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let pw = "";
    for (let i = 0; i < 8; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    return pw;
}

async function loadUnlinkedCustomers() {
    const select = document.getElementById("akunPilihPelanggan");
    select.innerHTML = `<option value="">— pilih pelanggan —</option>`;

    // Ambil langsung dari tabel orders (sama seperti Dashboard Aktif Anda,
    // publicly selectable), lalu cocokkan di sisi browser dengan akun yang
    // sudah ada. Ini menghindari fungsi RPC tambahan yang sempat bermasalah.
    const { data, error } = await supabaseClient
        .from("orders")
        .select("nomor_pesanan, dashboard, nomor_whatsapp")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        showToast("Gagal memuat daftar pelanggan aktif dari Dashboard Aktif", "danger");
        return;
    }

    const usedKeys = new Set(cachedAkunAccounts.map(a => a.match_key));
    const seenKeys = new Set();
    const unlinked = [];

    (data || []).forEach(row => {
        const key = normalizePelangganName(row.nomor_pesanan);
        if (!key || usedKeys.has(key) || seenKeys.has(key)) return;
        seenKeys.add(key);
        unlinked.push(row);
    });

    if (unlinked.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "— semua pelanggan aktif sudah punya akun —";
        opt.disabled = true;
        select.appendChild(opt);
        return;
    }

    unlinked.forEach((row, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = `${row.nomor_pesanan} (${row.dashboard})`;
        opt.dataset.nomor = row.nomor_pesanan;
        opt.dataset.wa = row.nomor_whatsapp || "";
        select.appendChild(opt);
    });
}

async function handleBuatAkun() {
    const matchSource = document.getElementById("akunMatchSource").value.trim();
    const username = document.getElementById("akunUsername").value.trim();
    const whatsapp = document.getElementById("akunWhatsapp").value.trim();
    const password = document.getElementById("akunPassword").value;

    if (!matchSource || !username || !password) {
        showToast("Lengkapi nama pelanggan, username, dan password", "danger");
        return;
    }
    if (password.length < 6) {
        showToast("Password minimal 6 karakter", "danger");
        return;
    }
    if (whatsapp && !validWhatsapp(whatsapp)) {
        showToast("Format WA harus diawali tanda +", "danger");
        return;
    }

    const { error } = await supabaseClient.rpc("admin_create_customer_account", {
        p_admin_pin: akunAdminPin,
        p_username: username,
        p_password: password,
        p_match_source: matchSource,
        p_whatsapp: whatsapp || null
    });

    if (error) {
        console.error(error);
        showToast(error.message || "Gagal membuat akun", "danger");
        return;
    }

    document.getElementById("akunMatchSource").value = "";
    document.getElementById("akunUsername").value = "";
    document.getElementById("akunWhatsapp").value = "";
    document.getElementById("akunPassword").value = "";
    document.getElementById("akunPilihPelanggan").value = "";

    openAkunCreatedModal(username, password);
    loadUnlinkedCustomers();
    loadAkunAccounts();
}

function openAkunCreatedModal(username, password) {
    const pesan = `Halo! Berikut akun login untuk memantau langganan harian Anda:\nUsername: ${username}\nPassword: ${password}\nLink login: (isi dengan URL portal /pelanggan Anda)`;

    modalBox.innerHTML = `
        <div class="modal-icon success">✅</div>
        <div class="modal-title">Akun Pelanggan Dibuat</div>
        <div class="modal-body">
            Sampaikan detail login berikut ke pelanggan (mis. lewat WhatsApp). Password ini
            tidak akan ditampilkan lagi setelah ditutup — catat atau salin sekarang.
        </div>
        <div class="modal-form">
            <div class="field">
                <label>Username</label>
                <input type="text" readonly value="${escapeHtml(username)}">
            </div>
            <div class="field">
                <label>Password</label>
                <input type="text" readonly value="${escapeHtml(password)}">
            </div>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-outline btn-wrap" id="akunCopyInfoBtn">📋 Salin Pesan untuk Pelanggan</button>
            <button type="button" class="btn btn-primary btn-wrap" id="modalCancelBtn">Selesai</button>
        </div>
    `;
    modalOverlay.classList.add("show");
    document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
    document.getElementById("akunCopyInfoBtn").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(pesan);
            showToast("Pesan berhasil disalin", "success");
        } catch (e) {
            showToast("Gagal menyalin", "danger");
        }
    });
}

async function loadAkunAccounts() {
    const loading = document.getElementById("akunLoadingState");
    const empty = document.getElementById("akunEmptyState");
    const tbody = document.getElementById("akunTableBody");

    loading.style.display = "flex";
    empty.style.display = "none";
    tbody.innerHTML = "";

    const { data, error } = await supabaseClient.rpc("admin_list_customer_accounts", {
        p_admin_pin: akunAdminPin
    });

    loading.style.display = "none";

    if (error) {
        console.error(error);
        showToast("Gagal memuat daftar akun pelanggan", "danger");
        cachedAkunAccounts = [];
        return;
    }

    cachedAkunAccounts = data || [];

    if (cachedAkunAccounts.length === 0) {
        empty.style.display = "flex";
        return;
    }

    data.forEach((acc, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td data-label="No">${i + 1}</td>
            <td data-label="Username"><b>${escapeHtml(acc.username)}</b></td>
            <td data-label="Terhubung ke">${escapeHtml(acc.match_key)}</td>
            <td data-label="WhatsApp">${escapeHtml(acc.whatsapp || "-")}</td>
            <td data-label="Pesanan Aktif"><span class="badge badge-proses">${acc.jumlah_pesanan_aktif}</span></td>
            <td data-label="Dibuat">${formatDateHuman(acc.created_at)}</td>
            <td data-label="Aksi">
                <div class="actions-cell">
                    <button class="btn btn-ghost btn-icon" title="Reset Password" onclick="openResetPasswordModal(${acc.id}, '${escapeHtml(acc.username)}')">🔁</button>
                    <button class="btn btn-danger btn-icon" title="Hapus Akun" onclick="handleHapusAkun(${acc.id}, '${escapeHtml(acc.username)}')">🗑</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    filterAkunTable();
}

function filterAkunTable() {
    const value = document.getElementById("akunSearchInput").value.toLowerCase();
    const rows = document.querySelectorAll("#akunTableBody tr");
    let visible = 0;
    rows.forEach(row => {
        const match = row.innerText.toLowerCase().includes(value);
        row.style.display = match ? "" : "none";
        if (match) visible++;
    });
    // rows.length > 0 di sini karena empty-state ditangani terpisah saat data kosong total
}

function openResetPasswordModal(id, username) {
    modalBox.innerHTML = `
        <div class="modal-icon info">🔁</div>
        <div class="modal-title">Reset Password — ${escapeHtml(username)}</div>
        <div class="modal-form">
            <div class="field">
                <label for="resetPwInput">Password Baru</label>
                <input type="text" id="resetPwInput" placeholder="Minimal 6 karakter">
            </div>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost btn-wrap" id="modalCancelBtn">Batal</button>
            <button type="button" class="btn btn-primary btn-wrap" id="modalSaveBtn">Simpan</button>
        </div>
    `;
    modalOverlay.classList.add("show");
    document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
    document.getElementById("modalSaveBtn").addEventListener("click", async () => {
        const pw = document.getElementById("resetPwInput").value;
        if (!pw || pw.length < 6) {
            showToast("Password minimal 6 karakter", "danger");
            return;
        }
        const { error } = await supabaseClient.rpc("admin_reset_customer_password", {
            p_admin_pin: akunAdminPin,
            p_id: id,
            p_new_password: pw
        });
        if (error) {
            showToast(error.message || "Gagal reset password", "danger");
            return;
        }
        closeModal();
        showToast(`Password ${username} berhasil direset`, "success");
    });
}

function handleHapusAkun(id, username) {
    openConfirmModal({
        icon: "🗑",
        iconClass: "danger",
        title: "Hapus Akun Pelanggan?",
        body: `Akun <b>${escapeHtml(username)}</b> tidak akan bisa login lagi. Data pesanan di Dashboard Aktif tidak terpengaruh.`,
        confirmText: "Ya, Hapus",
        confirmClass: "btn-danger",
        onConfirm: async () => {
            const { error } = await supabaseClient.rpc("admin_delete_customer_account", {
                p_admin_pin: akunAdminPin,
                p_id: id
            });
            if (error) {
                showToast("Gagal menghapus akun", "danger");
                return;
            }
            showToast("Akun pelanggan dihapus", "danger");
            loadUnlinkedCustomers();
            loadAkunAccounts();
        }
    });
}
