/**
 * CashFlow — catatan pendapatan per batch.
 * Semua data lewat fungsi database yang dikunci PIN admin (sql/cashflow.sql).
 * PIN dibagi dengan menu Akun Pelanggan lewat sessionStorage.
 */
let cfPin = sessionStorage.getItem("akun_admin_pin") || null;
let cfBatches = [];
let cfEntries = [];
let cfSelectedId = null;
let cfInited = false;

function cfRupiah(n) {
    return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function cfBatchById(id) {
    return cfBatches.find(b => b.id === id) || null;
}

async function cfRpc(name, params) {
    const res = await supabaseClient.rpc(name, { p_pin: cfPin, ...params });
    if (res.error) {
        console.error(res.error);
        if ((res.error.message || "").includes("PIN admin salah")) {
            cfPin = null;
            sessionStorage.removeItem("akun_admin_pin");
            document.getElementById("cfPinGate").style.display = "block";
            document.getElementById("cfContent").style.display = "none";
            showToast("PIN admin tidak valid, masukkan ulang", "danger");
        } else {
            showToast(res.error.message || "Terjadi kesalahan", "danger");
        }
    }
    return res;
}

function initCashflowPage() {
    if (!cfInited) {
        cfInited = true;
        bindCashflowEvents();
    }
    cfPin = sessionStorage.getItem("akun_admin_pin") || cfPin;
    if (cfPin) {
        showCfContent();
    } else {
        document.getElementById("cfPinGate").style.display = "block";
        document.getElementById("cfContent").style.display = "none";
    }
}

function bindCashflowEvents() {
    const submitPin = async () => {
        const pin = document.getElementById("cfPinInput").value;
        if (!pin) { showToast("Masukkan PIN admin", "danger"); return; }
        const { data, error } = await supabaseClient.rpc("admin_verify_pin", { p_pin: pin });
        if (error) { showToast("Error database: " + error.message, "danger"); return; }
        if (!data) { showToast("PIN admin salah", "danger"); return; }
        cfPin = pin;
        sessionStorage.setItem("akun_admin_pin", pin);
        document.getElementById("cfPinInput").value = "";
        showCfContent();
    };
    document.getElementById("cfPinSubmit").addEventListener("click", submitPin);
    document.getElementById("cfPinInput").addEventListener("keydown", e => { if (e.key === "Enter") submitPin(); });

    document.getElementById("cfNewBatchBtn").addEventListener("click", openNewBatchModal);
    document.getElementById("cfRenameBtn").addEventListener("click", openRenameBatchModal);
    document.getElementById("cfWithdrawBtn").addEventListener("click", confirmWithdrawBatch);
    document.getElementById("cfReactivateBtn").addEventListener("click", reactivateBatch);
    document.getElementById("cfDeleteBatchBtn").addEventListener("click", confirmDeleteBatch);

    document.getElementById("cfAddBtn").addEventListener("click", handleAddEntry);
    ["cfNama", "cfProduk", "cfHarga", "cfJumlah"].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener("input", updateCfPreview);
        el.addEventListener("keydown", e => { if (e.key === "Enter") handleAddEntry(); });
    });
}

async function showCfContent() {
    document.getElementById("cfPinGate").style.display = "none";
    document.getElementById("cfContent").style.display = "block";
    await loadCfBatches();
}

/* ---------------- Batch ---------------- */

async function loadCfBatches(selectId) {
    const { data, error } = await cfRpc("cf_list_batches", {});
    if (error) return;

    cfBatches = data || [];

    if (selectId && cfBatchById(selectId)) {
        cfSelectedId = selectId;
    } else if (!cfBatchById(cfSelectedId)) {
        const aktif = cfBatches.filter(b => b.status === "active");
        const pilih = aktif.length ? aktif[aktif.length - 1] : cfBatches[cfBatches.length - 1];
        cfSelectedId = pilih ? pilih.id : null;
    }

    renderCfSummary();
    renderCfBatchList();
    await loadCfEntries();
}

function renderCfSummary() {
    const sum = st => cfBatches.filter(b => b.status === st).reduce((a, b) => a + Number(b.total || 0), 0);
    const active = sum("active");
    const withdrawn = sum("withdrawn");
    document.getElementById("cfSumActive").textContent = cfRupiah(active);
    document.getElementById("cfSumWithdrawn").textContent = cfRupiah(withdrawn);
    document.getElementById("cfSumAll").textContent = cfRupiah(active + withdrawn);
    renderCfCharts();
}

function cfFmtWaktu(iso) {
    return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* Grafik + riwayat withdraw (tanggal & perbandingan dengan withdraw sebelumnya) */
let _cfCharts = {};
function renderCfCharts() {
    const wd = cfBatches.filter(b => b.status === "withdrawn" && b.withdrawn_at)
        .sort((x, y) => new Date(x.withdrawn_at) - new Date(y.withdrawn_at));

    const body = document.getElementById("cfWdBody");
    document.getElementById("cfWdEmpty").style.display = wd.length ? "none" : "flex";
    body.innerHTML = wd.map((b, i) => {
        const prev = i ? Number(wd[i - 1].total) : null;
        const cur = Number(b.total);
        let diff = "-";
        if (prev !== null) {
            const d = cur - prev, pct = prev ? Math.round(d / prev * 100) : 0;
            diff = `<span style="color:var(${d >= 0 ? "--success" : "--danger"})">${d >= 0 ? "▲ +" : "▼ "}${cfRupiah(d)} (${pct >= 0 ? "+" : ""}${pct}%)</span>`;
        }
        return `<tr><td class="col-no">${i + 1}</td><td>${escapeHtml(b.nama)}</td><td>${cfFmtWaktu(b.withdrawn_at)}</td><td class="num">${cfRupiah(cur)}</td><td class="num">${diff}</td></tr>`;
    }).join("");

    if (typeof Chart === "undefined") return;
    Chart.defaults.color = "#9A9AA8";
    Chart.defaults.font.family = "Inter, sans-serif";
    const grid = { color: "rgba(255,255,255,.06)" };
    const rp = v => v >= 1e6 ? (v / 1e6) + " jt" : v >= 1e3 ? (v / 1e3) + " rb" : v;
    const draw = (id, cfg) => { if (_cfCharts[id]) _cfCharts[id].destroy(); _cfCharts[id] = new Chart(document.getElementById(id), cfg); };
    const tip = { callbacks: { label: c => " " + cfRupiah(c.parsed.y) } };
    const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tip },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid, ticks: { callback: rp } } } };

    draw("cfChartBatch", { type: "bar", data: { labels: cfBatches.map(b => b.nama),
        datasets: [{ data: cfBatches.map(b => Number(b.total)), borderRadius: 4,
            backgroundColor: cfBatches.map(b => b.status === "active" ? "#D4AF6A" : "#5FC79A") }] }, options: base });

    draw("cfChartWd", { type: "line", data: { labels: wd.map(b => new Date(b.withdrawn_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })),
        datasets: [{ data: wd.map(b => Number(b.total)), borderColor: "#D4AF6A", backgroundColor: "rgba(212,175,106,.14)", fill: true, tension: .3, pointRadius: 4, pointBackgroundColor: "#D4AF6A" }] }, options: base });
}

function renderCfBatchList() {
    const list = document.getElementById("cfBatchList");
    document.getElementById("cfNoBatchState").style.display = cfBatches.length ? "none" : "flex";
    list.innerHTML = cfBatches.map(b => {
        const aktif = b.status === "active";
        return `
            <button type="button" class="cf-batch-card ${b.id === cfSelectedId ? "selected" : ""} ${aktif ? "is-active" : "is-withdrawn"}" onclick="selectCfBatch(${b.id})">
                <div class="cf-batch-card-top">
                    <span class="cf-batch-name">${escapeHtml(b.nama)}</span>
                    <span class="cf-pill ${aktif ? "pill-active" : "pill-withdrawn"}">${aktif ? "● Aktif" : "✓ Sudah Diambil"}</span>
                </div>
                <div class="cf-batch-total">${cfRupiah(b.total)}</div>
                <div class="cf-batch-sub">${b.item_count} transaksi · ${formatDateHuman(b.created_at)}</div>
                ${b.withdrawn_at ? `<div class="cf-batch-sub">🏦 Withdraw: ${cfFmtWaktu(b.withdrawn_at)}</div>` : ""}
            </button>`;
    }).join("");
}

async function selectCfBatch(id) {
    cfSelectedId = id;
    renderCfBatchList();
    await loadCfEntries();
}

function openNewBatchModal() {
    const nextNum = cfBatches.length + 1;
    modalBox.innerHTML = `
        <div class="modal-icon info">🗃️</div>
        <div class="modal-title">Buat Batch Baru</div>
        <div class="modal-form">
            <div class="field">
                <label for="cfNewBatchName">Nama Batch</label>
                <input type="text" id="cfNewBatchName" value="Batch ${nextNum}" placeholder="cth. Batch ${nextNum}">
            </div>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost btn-wrap" id="modalCancelBtn">Batal</button>
            <button type="button" class="btn btn-primary btn-wrap" id="modalSaveBtn">Buat Batch</button>
        </div>`;
    modalOverlay.classList.add("show");
    const input = document.getElementById("cfNewBatchName");
    input.focus(); input.select();
    const save = async () => {
        const { data, error } = await cfRpc("cf_create_batch", { p_nama: input.value });
        if (error) return;
        closeModal();
        showToast("Batch baru dibuat", "success");
        await loadCfBatches(data);
    };
    document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
    document.getElementById("modalSaveBtn").addEventListener("click", save);
    input.addEventListener("keydown", e => { if (e.key === "Enter") save(); });
}

function openRenameBatchModal() {
    const b = cfBatchById(cfSelectedId);
    if (!b) return;
    modalBox.innerHTML = `
        <div class="modal-icon info">✏️</div>
        <div class="modal-title">Ganti Nama Batch</div>
        <div class="modal-form">
            <div class="field">
                <label for="cfRenameInput">Nama Batch</label>
                <input type="text" id="cfRenameInput" value="${escapeHtml(b.nama)}">
            </div>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost btn-wrap" id="modalCancelBtn">Batal</button>
            <button type="button" class="btn btn-primary btn-wrap" id="modalSaveBtn">Simpan</button>
        </div>`;
    modalOverlay.classList.add("show");
    const input = document.getElementById("cfRenameInput");
    input.focus(); input.select();
    const save = async () => {
        const { error } = await cfRpc("cf_rename_batch", { p_id: b.id, p_nama: input.value });
        if (error) return;
        closeModal();
        showToast("Nama batch diperbarui", "success");
        await loadCfBatches(b.id);
    };
    document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
    document.getElementById("modalSaveBtn").addEventListener("click", save);
    input.addEventListener("keydown", e => { if (e.key === "Enter") save(); });
}

function confirmWithdrawBatch() {
    const b = cfBatchById(cfSelectedId);
    if (!b) return;
    openConfirmModal({
        icon: "🏦",
        iconClass: "success",
        title: `Tandai ${b.nama} sudah diambil?`,
        body: `Total <b>${cfRupiah(b.total)}</b> dari ${b.item_count} transaksi akan dikunci sebagai <b>sudah diambil (withdraw)</b>. Anda tetap bisa mengaktifkannya kembali nanti, lalu lanjut ke batch berikutnya.`,
        confirmText: "Ya, Sudah Diambil",
        confirmClass: "btn-success",
        onConfirm: async () => {
            const { error } = await cfRpc("cf_set_batch_status", { p_id: b.id, p_status: "withdrawn" });
            if (error) return;
            showToast(`${b.nama} ditandai sudah diambil`, "success");
            await loadCfBatches(b.id);
        }
    });
}

async function reactivateBatch() {
    const b = cfBatchById(cfSelectedId);
    if (!b) return;
    const { error } = await cfRpc("cf_set_batch_status", { p_id: b.id, p_status: "active" });
    if (error) return;
    showToast(`${b.nama} diaktifkan kembali`, "success");
    await loadCfBatches(b.id);
}

function confirmDeleteBatch() {
    const b = cfBatchById(cfSelectedId);
    if (!b) return;
    openConfirmModal({
        icon: "🗑",
        iconClass: "danger",
        title: `Hapus ${b.nama}?`,
        body: `Batch beserta <b>${b.item_count} transaksi</b> di dalamnya akan dihapus permanen dan tidak bisa dikembalikan. Jika hanya ingin menutup batch, gunakan "Tandai Sudah Diambil".`,
        confirmText: "Ya, Hapus Batch",
        confirmClass: "btn-danger",
        onConfirm: async () => {
            const { error } = await cfRpc("cf_delete_batch", { p_id: b.id });
            if (error) return;
            cfSelectedId = null;
            showToast("Batch dihapus", "danger");
            await loadCfBatches();
        }
    });
}

/* ---------------- Transaksi (baris) ---------------- */

async function loadCfEntries() {
    const panel = document.getElementById("cfBatchPanel");
    const b = cfBatchById(cfSelectedId);

    if (!b) {
        panel.style.display = "none";
        cfEntries = [];
        return;
    }
    panel.style.display = "block";

    const { data, error } = await cfRpc("cf_list_entries", { p_batch_id: b.id });
    if (error) return;
    cfEntries = data || [];
    renderCfEntries();
}

function renderCfEntries() {
    const b = cfBatchById(cfSelectedId);
    if (!b) return;

    const aktif = b.status === "active";

    document.getElementById("cfBatchTitle").textContent = b.nama;
    document.getElementById("cfBatchMeta").innerHTML =
        `<span class="cf-pill ${aktif ? "pill-active" : "pill-withdrawn"}">${aktif ? "● Aktif" : "✓ Sudah Diambil"}</span>
         <span>Dibuat ${formatDateHuman(b.created_at)}</span>` +
        (b.withdrawn_at ? `<span>Diambil ${formatDateHuman(b.withdrawn_at)}</span>` : "");

    document.getElementById("cfForm").style.display = aktif ? "grid" : "none";
    document.getElementById("cfLockedNote").style.display = aktif ? "none" : "block";
    document.getElementById("cfWithdrawBtn").style.display = aktif ? "inline-flex" : "none";
    document.getElementById("cfReactivateBtn").style.display = aktif ? "none" : "inline-flex";

    const body = document.getElementById("cfEntryBody");
    body.innerHTML = cfEntries.map((e, i) => `
        <tr>
            <td data-label="No" class="col-no">${i + 1}</td>
            <td data-label="Nama"><b>${escapeHtml(e.nama)}</b></td>
            <td data-label="Produk">${escapeHtml(e.produk)}</td>
            <td data-label="Harga" class="num">${cfRupiah(e.harga)}</td>
            <td data-label="Jumlah" class="num">${e.jumlah}</td>
            <td data-label="Total" class="num cf-row-total">${cfRupiah(e.total)}</td>
            <td data-label="Aksi">
                ${aktif ? `<div class="actions-cell">
                    <button class="btn btn-ghost btn-icon" onclick="openEditEntryModal(${e.id})" title="Edit">✏️</button>
                    <button class="btn btn-danger btn-icon" onclick="confirmDeleteEntry(${e.id})" title="Hapus">🗑</button>
                </div>` : `<span class="cell-sub">🔒</span>`}
            </td>
        </tr>`).join("");

    const grand = cfEntries.reduce((a, e) => a + Number(e.total || 0), 0);
    const qty = cfEntries.reduce((a, e) => a + Number(e.jumlah || 0), 0);
    document.getElementById("cfFootQty").textContent = qty;
    document.getElementById("cfFootTotal").textContent = cfRupiah(grand);

    document.getElementById("cfEmptyState").style.display = cfEntries.length ? "none" : "flex";
    document.getElementById("cfTable").style.display = cfEntries.length ? "table" : "none";
    updateCfPreview();
}

function updateCfPreview() {
    const harga = Number(document.getElementById("cfHarga").value) || 0;
    const jumlah = Number(document.getElementById("cfJumlah").value) || 0;
    document.getElementById("cfTotalPreview").textContent = cfRupiah(harga * jumlah);
}

function readEntryFields(prefix) {
    return {
        nama: document.getElementById(prefix + "Nama").value.trim(),
        produk: document.getElementById(prefix + "Produk").value.trim(),
        harga: Math.round(Number(document.getElementById(prefix + "Harga").value)),
        jumlah: Math.round(Number(document.getElementById(prefix + "Jumlah").value))
    };
}

function validateEntry(f) {
    if (!f.nama) return "Nama wajib diisi";
    if (!f.produk) return "Produk wajib diisi";
    if (!Number.isFinite(f.harga) || f.harga < 0) return "Harga tidak valid";
    if (!Number.isFinite(f.jumlah) || f.jumlah < 1) return "Jumlah minimal 1";
    return null;
}

async function handleAddEntry() {
    const b = cfBatchById(cfSelectedId);
    if (!b) return;
    const f = readEntryFields("cf");
    const err = validateEntry(f);
    if (err) { showToast(err, "danger"); return; }

    const { error } = await cfRpc("cf_add_entry", {
        p_batch_id: b.id, p_nama: f.nama, p_produk: f.produk, p_harga: f.harga, p_jumlah: f.jumlah
    });
    if (error) return;

    document.getElementById("cfNama").value = "";
    document.getElementById("cfHarga").value = "";
    document.getElementById("cfJumlah").value = "1";
    document.getElementById("cfNama").focus();
    showToast("Transaksi ditambahkan", "success");
    await loadCfBatches(b.id);
}

function openEditEntryModal(id) {
    const e = cfEntries.find(x => x.id === id);
    if (!e) return;
    modalBox.innerHTML = `
        <div class="modal-icon info">✏️</div>
        <div class="modal-title">Edit Transaksi</div>
        <div class="modal-form">
            <div class="field"><label for="cfEditNama">Nama</label><input type="text" id="cfEditNama" value="${escapeHtml(e.nama)}"></div>
            <div class="field"><label for="cfEditProduk">Produk</label><input type="text" id="cfEditProduk" value="${escapeHtml(e.produk)}"></div>
            <div class="field"><label for="cfEditHarga">Harga (Rp)</label><input type="number" id="cfEditHarga" min="0" value="${e.harga}"></div>
            <div class="field"><label for="cfEditJumlah">Jumlah</label><input type="number" id="cfEditJumlah" min="1" value="${e.jumlah}"></div>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost btn-wrap" id="modalCancelBtn">Batal</button>
            <button type="button" class="btn btn-primary btn-wrap" id="modalSaveBtn">Simpan</button>
        </div>`;
    modalOverlay.classList.add("show");
    document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
    document.getElementById("modalSaveBtn").addEventListener("click", async () => {
        const f = readEntryFields("cfEdit");
        const err = validateEntry(f);
        if (err) { showToast(err, "danger"); return; }
        const { error } = await cfRpc("cf_update_entry", {
            p_id: id, p_nama: f.nama, p_produk: f.produk, p_harga: f.harga, p_jumlah: f.jumlah
        });
        if (error) return;
        closeModal();
        showToast("Transaksi diperbarui", "success");
        await loadCfBatches(cfSelectedId);
    });
}

function confirmDeleteEntry(id) {
    const e = cfEntries.find(x => x.id === id);
    if (!e) return;
    openConfirmModal({
        icon: "🗑",
        iconClass: "danger",
        title: "Hapus transaksi ini?",
        body: `<b>${escapeHtml(e.nama)}</b> — ${escapeHtml(e.produk)} (${cfRupiah(e.total)}) akan dihapus dari batch.`,
        confirmText: "Ya, Hapus",
        confirmClass: "btn-danger",
        onConfirm: async () => {
            const { error } = await cfRpc("cf_delete_entry", { p_id: id });
            if (error) return;
            showToast("Transaksi dihapus", "danger");
            await loadCfBatches(cfSelectedId);
        }
    });
}
