/**
 * SUPPLY & STOCK (admin) + PENGUMUMAN — sql/supply.sql
 * - Batch stok (mis. "Batch 1 (jagung)") berisi beberapa akun; stok tiap akun bisa diedit, total dihitung otomatis.
 * - Order dari pelanggan masuk ke tab "Order"; admin mencentang jika sudah dikirim.
 */
let spPin = sessionStorage.getItem("akun_admin_pin") || null;
let spBatches = [], spOrders = [], spTab = "stok", spOrderFilter = "pending", spInited = false;

const spEl = id => document.getElementById(id);
const spNum = n => Number(n || 0).toLocaleString("id-ID");
const spWaktu = iso => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

async function spRpc(name, params) {
    const res = await supabaseClient.rpc(name, { p_pin: spPin, ...params });
    if (res.error) {
        console.error(res.error);
        const m = res.error.message || "";
        if (m.includes("PIN admin salah")) {
            spPin = null; sessionStorage.removeItem("akun_admin_pin");
            ["spPinGate", "anPinGate"].forEach(i => spEl(i) && (spEl(i).style.display = "block"));
            ["spContent", "anContent"].forEach(i => spEl(i) && (spEl(i).style.display = "none"));
            showToast("PIN admin tidak valid, masukkan ulang", "danger");
        } else if (/does not exist|schema cache/i.test(m)) {
            showToast("Jalankan dulu sql/supply.sql di Supabase SQL Editor", "danger");
        } else showToast(m || "Terjadi kesalahan", "danger");
    }
    return res;
}

/* form modal generik: fields = [{id,label,type,value,placeholder}] */
function spForm(title, icon, fields, onSave) {
    modalBox.innerHTML = `<div class="modal-icon info">${icon}</div><div class="modal-title">${escapeHtml(title)}</div>
        <div class="modal-form">${fields.map(f => `<div class="field"><label for="spf_${f.id}">${escapeHtml(f.label)}</label>
            <input type="${f.type || "text"}" id="spf_${f.id}" value="${escapeHtml(f.value ?? "")}" placeholder="${escapeHtml(f.placeholder || "")}" ${f.type === "number" ? 'min="0"' : ""}></div>`).join("")}</div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost btn-wrap" id="modalCancelBtn">Batal</button><button type="button" class="btn btn-primary btn-wrap" id="spfSave">Simpan</button></div>`;
    modalOverlay.classList.add("show");
    spEl("spf_" + fields[0].id).focus();
    const save = () => { const v = {}; fields.forEach(f => v[f.id] = spEl("spf_" + f.id).value.trim()); closeModal(); onSave(v); };
    spEl("modalCancelBtn").addEventListener("click", closeModal);
    spEl("spfSave").addEventListener("click", save);
    modalBox.querySelectorAll("input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") save(); }));
}

function initSupplyPage() {
    if (!spInited) { spInited = true; spBind(); }
    spPin = sessionStorage.getItem("akun_admin_pin") || spPin;
    if (spPin) spShow();
    else { spEl("spPinGate").style.display = "block"; spEl("spContent").style.display = "none"; }
}

function spBind() {
    const submit = async () => {
        const pin = spEl("spPinInput").value;
        if (!pin) { showToast("Masukkan PIN admin", "danger"); return; }
        const { data, error } = await supabaseClient.rpc("admin_verify_pin", { p_pin: pin });
        if (error) { showToast("Error database: " + error.message, "danger"); return; }
        if (!data) { showToast("PIN admin salah", "danger"); return; }
        spPin = pin; sessionStorage.setItem("akun_admin_pin", pin); spEl("spPinInput").value = "";
        spShow();
    };
    spEl("spPinSubmit").addEventListener("click", submit);
    spEl("spPinInput").addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
    document.querySelectorAll("#spTabs .tab").forEach(t => t.addEventListener("click", () => {
        document.querySelectorAll("#spTabs .tab").forEach(x => x.classList.remove("active"));
        t.classList.add("active"); spTab = t.dataset.tab;
        spEl("spStokWrap").style.display = spTab === "stok" ? "block" : "none";
        spEl("spOrderWrap").style.display = spTab === "order" ? "block" : "none";
    }));
    spEl("spNewBatchBtn").addEventListener("click", () => spForm("Batch Stok Baru", "📦", [
        { id: "nama", label: "Nama Batch", placeholder: "mis. Batch 1" },
        { id: "item", label: "Nama Barang", placeholder: "mis. Jagung" },
        { id: "satuan", label: "Satuan", value: "pcs", placeholder: "pcs / kg / karung" },
        { id: "jumlah", label: "Jumlah Akun (bisa ditambah / dihapus nanti)", type: "number", value: "4" }
    ], async v => {
        const { error } = await spRpc("sp_create_batch", { p_nama: v.nama, p_item: v.item, p_satuan: v.satuan, p_jumlah_akun: parseInt(v.jumlah, 10) || 4 });
        if (!error) { showToast("Batch dibuat", "success"); spLoad(); }
    }));
    document.querySelectorAll("#spOrderFilter button").forEach(b => b.addEventListener("click", () => {
        document.querySelectorAll("#spOrderFilter button").forEach(x => x.classList.remove("active"));
        b.classList.add("active"); spOrderFilter = b.dataset.f; spLoadOrders();
    }));
}

async function spShow() {
    spEl("spPinGate").style.display = "none"; spEl("spContent").style.display = "block";
    await spLoad();
}
async function spLoad() { await Promise.all([spLoadBatches(), spLoadOrders(), spLoadPendingCount()]); }

async function spLoadBatches() {
    const { data, error } = await spRpc("sp_list_batches", {});
    if (error) return;
    spBatches = data || [];
    spEl("spKpiBatch").textContent = spBatches.length;
    spEl("spNoBatch").style.display = spBatches.length ? "none" : "flex";
    spEl("spBatches").innerHTML = spBatches.map(b => `
        <section class="panel sp-batch">
            <div class="cf-batch-head">
                <div><h2>${escapeHtml(b.nama)}${b.item ? ` <span class="sp-item">(${escapeHtml(b.item)})</span>` : ""}</h2>
                    <div class="cf-batch-meta"><span>Satuan: ${escapeHtml(b.satuan)}</span><span>${b.visible ? "👁 Tampil ke pelanggan" : "🙈 Disembunyikan dari pelanggan"}</span></div></div>
                <div class="cf-batch-actions">
                    <button class="btn btn-outline" onclick="spToggleVisible(${b.id})">${b.visible ? "🙈 Sembunyikan" : "👁 Tampilkan"}</button>
                    <button class="btn btn-outline" onclick="spEditBatch(${b.id})">✏️ Ubah</button>
                    <button class="btn btn-danger btn-icon" title="Hapus batch" onclick="spDeleteBatch(${b.id})">🗑</button>
                </div>
            </div>
            <div class="table-wrap aksi-pinned">
                <table style="min-width:460px;">
                    <thead><tr><th>No</th><th>Akun</th><th class="num">Stok (${escapeHtml(b.satuan)})</th><th>Diubah</th><th class="col-aksi">Aksi</th></tr></thead>
                    <tbody>${b.accounts.map((a, i) => `
                        <tr><td class="col-no">${i + 1}</td><td><b>${escapeHtml(a.nama)}</b></td>
                        <td class="num"><input type="number" min="0" class="sp-input" id="spS${a.id}" value="${a.stok}" onkeydown="if(event.key==='Enter')spSaveStok(${a.id})"></td>
                        <td>${spWaktu(a.updated_at)}</td>
                        <td class="col-aksi"><div class="actions-cell">
                            <button class="btn btn-success btn-icon" title="Simpan stok" onclick="spSaveStok(${a.id})">💾</button>
                            <button class="btn btn-outline btn-icon" title="Ganti nama akun" onclick="spRenameAcc(${a.id})">✏️</button>
                            <button class="btn btn-danger btn-icon" title="Hapus akun" onclick="spDeleteAcc(${a.id})">🗑</button>
                        </div></td></tr>`).join("")}</tbody>
                    <tfoot><tr><td></td><td><b>TOTAL</b></td><td class="num sp-total">${spNum(b.total)}</td><td></td><td class="col-aksi"></td></tr></tfoot>
                </table>
            </div>
            <div style="margin-top:12px;"><button class="btn btn-outline" onclick="spAddAcc(${b.id})">➕ Tambah Akun</button></div>
        </section>`).join("");
}

const spFindBatch = id => spBatches.find(b => b.id === id);
const spFindAcc = id => { for (const b of spBatches) { const a = b.accounts.find(x => x.id === id); if (a) return a; } return null; };

async function spSaveStok(id) {
    const v = parseInt(spEl("spS" + id).value, 10);
    if (isNaN(v) || v < 0) { showToast("Stok harus angka 0 atau lebih", "danger"); return; }
    const { error } = await spRpc("sp_update_account", { p_id: id, p_nama: null, p_stok: v });
    if (!error) { showToast("Stok disimpan", "success"); spLoadBatches(); }
}
function spRenameAcc(id) { const a = spFindAcc(id); if (a) spForm("Ganti Nama Akun", "✏️", [{ id: "nama", label: "Nama Akun", value: a.nama }], async v => {
    const { error } = await spRpc("sp_update_account", { p_id: id, p_nama: v.nama, p_stok: null }); if (!error) spLoadBatches(); }); }
function spAddAcc(batchId) { spForm("Tambah Akun", "➕", [{ id: "nama", label: "Nama Akun", placeholder: "mis. Akun 5" }], async v => {
    const { error } = await spRpc("sp_add_account", { p_batch_id: batchId, p_nama: v.nama }); if (!error) spLoadBatches(); }); }
function spDeleteAcc(id) { const a = spFindAcc(id); if (!a) return;
    openConfirmModal({ icon: "🗑", iconClass: "danger", title: `Hapus ${a.nama}?`, body: "Stok akun ini tidak akan dihitung lagi di total.", confirmText: "Ya, Hapus", confirmClass: "btn-danger",
        onConfirm: async () => { const { error } = await spRpc("sp_delete_account", { p_id: id }); if (!error) spLoadBatches(); } }); }
async function spToggleVisible(id) { const b = spFindBatch(id); if (!b) return;
    const { error } = await spRpc("sp_update_batch", { p_id: id, p_nama: null, p_item: null, p_satuan: null, p_visible: !b.visible }); if (!error) spLoadBatches(); }
function spEditBatch(id) { const b = spFindBatch(id); if (b) spForm("Ubah Batch", "📦", [
    { id: "nama", label: "Nama Batch", value: b.nama }, { id: "item", label: "Nama Barang", value: b.item }, { id: "satuan", label: "Satuan", value: b.satuan }],
    async v => { const { error } = await spRpc("sp_update_batch", { p_id: id, p_nama: v.nama, p_item: v.item, p_satuan: v.satuan, p_visible: null }); if (!error) spLoadBatches(); }); }
function spDeleteBatch(id) { const b = spFindBatch(id); if (!b) return;
    openConfirmModal({ icon: "🗑", iconClass: "danger", title: `Hapus ${b.nama}?`, body: "Semua akun dan order untuk batch ini ikut terhapus permanen.", confirmText: "Ya, Hapus", confirmClass: "btn-danger",
        onConfirm: async () => { const { error } = await spRpc("sp_delete_batch", { p_id: id }); if (!error) spLoad(); } }); }

/* ---- order masuk dari pelanggan ---- */
async function spLoadPendingCount() {
    const { data } = await spRpc("sp_list_orders", { p_status: "pending" });
    const n = (data || []).length;
    spEl("spKpiPending").textContent = n;
    spEl("spOrderBadge").textContent = n; spEl("spOrderBadge").style.display = n ? "inline-block" : "none";
}
async function spLoadOrders() {
    const { data, error } = await spRpc("sp_list_orders", { p_status: spOrderFilter });
    if (error) return;
    spOrders = data || [];
    spEl("spOrderEmpty").style.display = spOrders.length ? "none" : "flex";
    spEl("spOrderBody").innerHTML = spOrders.map((o, i) => `
        <tr><td class="col-no">${i + 1}</td><td>${spWaktu(o.created_at)}</td><td><b>${escapeHtml(o.username)}</b></td>
        <td>${escapeHtml(o.item || o.batch)}</td><td class="num"><b>${spNum(o.qty)}</b> ${escapeHtml(o.satuan)}</td>
        <td>${o.status === "sent" ? `<span class="badge badge-done">✅ Terkirim</span> <span class="cell-sub">${spWaktu(o.sent_at)}</span>` : `<span class="badge badge-proses">⏳ Menunggu</span>`}</td>
        <td class="col-aksi"><div class="actions-cell">
            ${o.status === "sent"
                ? `<button class="btn btn-ghost btn-icon" title="Batalkan centang" onclick="spSetSent(${o.id}, false)">↩️</button>`
                : `<button class="btn btn-success btn-icon" title="Tandai sudah dikirim" onclick="spSetSent(${o.id}, true)">✅</button>`}
            <button class="btn btn-danger btn-icon" title="Hapus order" onclick="spDeleteOrder(${o.id})">🗑</button>
        </div></td></tr>`).join("");
    if (spOrderFilter === "all") spEl("spKpiSent").textContent = spOrders.filter(o => o.status === "sent").length;
    else if (spOrderFilter === "sent") spEl("spKpiSent").textContent = spOrders.length;
    else { const r = await spRpc("sp_list_orders", { p_status: "sent" }); spEl("spKpiSent").textContent = (r.data || []).length; }
}
async function spSetSent(id, sent) {
    const { error } = await spRpc("sp_set_order_status", { p_id: id, p_sent: sent });
    if (!error) { showToast(sent ? "Order ditandai terkirim" : "Centang dibatalkan", "success"); spLoadOrders(); spLoadPendingCount(); }
}
function spDeleteOrder(id) {
    openConfirmModal({ icon: "🗑", iconClass: "danger", title: "Hapus order?", body: "Order ini akan dihapus permanen.", confirmText: "Ya, Hapus", confirmClass: "btn-danger",
        onConfirm: async () => { const { error } = await spRpc("sp_delete_order", { p_id: id }); if (!error) { spLoadOrders(); spLoadPendingCount(); } } });
}
