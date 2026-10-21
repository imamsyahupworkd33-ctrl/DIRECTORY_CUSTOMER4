/**
 * HAV SELL — simpan key per batch (sql/havsell.sql).
 * Paste banyak key -> masuk tabel. "Ambil N" -> hanya key-nya yang ditampilkan,
 * lalu N key teratas pindah ke Arsip Key.
 */
let hvPin = sessionStorage.getItem("akun_admin_pin") || null;
let hvBatches = [], hvKeys = [], hvSelected = null, hvTab = "available", hvInited = false;

const hvById = id => hvBatches.find(b => b.id === id) || null;
const hvEl = id => document.getElementById(id);
const hvWaktu = iso => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

async function hvRpc(name, params) {
    const res = await supabaseClient.rpc(name, { p_pin: hvPin, ...params });
    if (res.error) {
        console.error(res.error);
        const m = res.error.message || "";
        if (m.includes("PIN admin salah")) {
            hvPin = null; sessionStorage.removeItem("akun_admin_pin");
            hvEl("hvPinGate").style.display = "block"; hvEl("hvContent").style.display = "none";
            showToast("PIN admin tidak valid, masukkan ulang", "danger");
        } else if (/does not exist|schema cache/i.test(m)) {
            showToast("Jalankan dulu sql/havsell.sql di Supabase SQL Editor", "danger");
        } else showToast(m || "Terjadi kesalahan", "danger");
    }
    return res;
}

function initHavSellPage() {
    if (!hvInited) { hvInited = true; hvBind(); }
    hvPin = sessionStorage.getItem("akun_admin_pin") || hvPin;
    if (hvPin) hvShow();
    else { hvEl("hvPinGate").style.display = "block"; hvEl("hvContent").style.display = "none"; }
}

function hvBind() {
    const submit = async () => {
        const pin = hvEl("hvPinInput").value;
        if (!pin) { showToast("Masukkan PIN admin", "danger"); return; }
        const { data, error } = await supabaseClient.rpc("admin_verify_pin", { p_pin: pin });
        if (error) { showToast("Error database: " + error.message, "danger"); return; }
        if (!data) { showToast("PIN admin salah", "danger"); return; }
        hvPin = pin; sessionStorage.setItem("akun_admin_pin", pin); hvEl("hvPinInput").value = "";
        hvShow();
    };
    hvEl("hvPinSubmit").addEventListener("click", submit);
    hvEl("hvPinInput").addEventListener("keydown", e => { if (e.key === "Enter") submit(); });

    hvEl("hvNewBatchBtn").addEventListener("click", () => hvNamePrompt("Batch Baru", "", async nama => {
        const { data, error } = await hvRpc("hs_create_batch", { p_nama: nama });
        if (!error) { showToast("Batch dibuat", "success"); hvLoadBatches(data); }
    }));
    hvEl("hvRenameBtn").addEventListener("click", () => { const b = hvById(hvSelected); if (b) hvNamePrompt("Ganti Nama Batch", b.nama, async nama => {
        const { error } = await hvRpc("hs_rename_batch", { p_id: b.id, p_nama: nama }); if (!error) hvLoadBatches(b.id);
    }); });
    hvEl("hvDeleteBatchBtn").addEventListener("click", () => { const b = hvById(hvSelected); if (!b) return;
        openConfirmModal({ icon: "🗑", iconClass: "danger", title: `Hapus ${b.nama}?`,
            body: `Semua key di batch ini (${b.available} di daftar + ${b.taken} di arsip) akan terhapus permanen.`,
            confirmText: "Ya, Hapus", confirmClass: "btn-danger",
            onConfirm: async () => { const { error } = await hvRpc("hs_delete_batch", { p_id: b.id }); if (!error) { hvSelected = null; hvLoadBatches(); } } });
    });
    hvEl("hvPaste").addEventListener("input", hvPreview);
    hvEl("hvAddBtn").addEventListener("click", hvAdd);
    hvEl("hvTakeBtn").addEventListener("click", hvTake);
    hvEl("hvTakeN").addEventListener("keydown", e => { if (e.key === "Enter") hvTake(); });
    hvEl("hvCopyAllBtn").addEventListener("click", () => hvCopy(hvKeys.map(k => k.key).join("\n"), `${hvKeys.length} key disalin`));
    document.querySelectorAll("#hvTabs .tab").forEach(t => t.addEventListener("click", () => {
        document.querySelectorAll("#hvTabs .tab").forEach(x => x.classList.remove("active"));
        t.classList.add("active"); hvTab = t.dataset.tab; hvLoadKeys();
    }));
}

async function hvShow() {
    hvEl("hvPinGate").style.display = "none"; hvEl("hvContent").style.display = "block";
    await hvLoadBatches();
}

function hvNamePrompt(title, value, onSave) {
    modalBox.innerHTML = `<div class="modal-icon info">🔑</div><div class="modal-title">${escapeHtml(title)}</div>
        <div class="modal-form"><div class="field"><label for="hvNameIn">Nama Batch</label><input type="text" id="hvNameIn" value="${escapeHtml(value)}" placeholder="kosongkan = otomatis"></div></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost btn-wrap" id="modalCancelBtn">Batal</button><button type="button" class="btn btn-primary btn-wrap" id="hvNameSave">Simpan</button></div>`;
    modalOverlay.classList.add("show");
    const input = hvEl("hvNameIn"); input.focus();
    const save = () => { const v = input.value.trim(); closeModal(); onSave(v); };
    hvEl("modalCancelBtn").addEventListener("click", closeModal);
    hvEl("hvNameSave").addEventListener("click", save);
    input.addEventListener("keydown", e => { if (e.key === "Enter") save(); });
}

async function hvLoadBatches(selectId) {
    const { data, error } = await hvRpc("hs_list_batches", {});
    if (error) return;
    hvBatches = data || [];
    if (selectId && hvById(selectId)) hvSelected = selectId;
    else if (!hvById(hvSelected)) hvSelected = hvBatches.length ? hvBatches[hvBatches.length - 1].id : null;
    hvRenderBatches();
    await hvLoadKeys();
}

function hvRenderBatches() {
    hvEl("hvSumAvail").textContent = hvBatches.reduce((a, b) => a + Number(b.available), 0);
    hvEl("hvSumTaken").textContent = hvBatches.reduce((a, b) => a + Number(b.taken), 0);
    hvEl("hvSumBatch").textContent = hvBatches.length;
    hvEl("hvNoBatch").style.display = hvBatches.length ? "none" : "flex";
    hvEl("hvBatchList").innerHTML = hvBatches.map(b => `
        <button type="button" class="cf-batch-card ${b.id === hvSelected ? "selected" : ""}" onclick="hvSelect(${b.id})">
            <div class="cf-batch-card-top"><span class="cf-batch-name">${escapeHtml(b.nama)}</span>
                <span class="cf-pill ${b.available ? "pill-active" : "pill-withdrawn"}">${b.available ? "● Ada Stok" : "Habis"}</span></div>
            <div class="cf-batch-total">${b.available} <span style="font-size:12px;font-weight:500;color:var(--text-muted)">key</span></div>
            <div class="cf-batch-sub">${b.taken} di arsip · ${formatDateHuman(b.created_at)}</div>
        </button>`).join("");
    hvEl("hvBatchPanel").style.display = hvSelected ? "block" : "none";
    const b = hvById(hvSelected);
    if (b) { hvEl("hvBatchTitle").textContent = b.nama; hvEl("hvAvailInfo").textContent = `Tersedia: ${b.available} key`; hvEl("hvTakeN").max = b.available; }
}
function hvSelect(id) { hvSelected = id; hvRenderBatches(); hvLoadKeys(); }

async function hvLoadKeys() {
    if (!hvSelected) { hvKeys = []; return; }
    const { data, error } = await hvRpc("hs_list_keys", { p_batch_id: hvSelected, p_status: hvTab });
    if (error) return;
    hvKeys = data || [];
    const arsip = hvTab === "taken";
    hvEl("hvHeadExtra").style.display = arsip ? "" : "none";
    hvEl("hvEmpty").style.display = hvKeys.length ? "none" : "flex";
    hvEl("hvEmptyText").textContent = arsip ? "Arsip key masih kosong" : "Belum ada key. Paste daftar key di atas lalu klik Tambahkan.";
    hvEl("hvBody").innerHTML = hvKeys.map((k, i) => `
        <tr><td class="col-no">${i + 1}</td><td class="mono">${escapeHtml(k.key)}</td>
        ${arsip ? `<td>${hvWaktu(k.taken_at)}</td>` : ""}
        <td class="col-aksi"><div class="actions-cell">
            <button class="btn btn-outline btn-icon" title="Salin" onclick="hvCopyOne(${k.id})">📋</button>
            ${arsip ? `<button class="btn btn-ghost btn-icon" title="Pulihkan ke daftar" onclick="hvRestore(${k.id})">↩️</button>` : ""}
            <button class="btn btn-danger btn-icon" title="Hapus permanen" onclick="hvDelete(${k.id})">🗑</button>
        </div></td></tr>`).join("");
}

async function hvCopy(text, msg) {
    try { await navigator.clipboard.writeText(text); showToast(msg, "success"); }
    catch (e) { showToast("Gagal menyalin (izinkan clipboard di browser)", "danger"); }
}
function hvCopyOne(id) { const k = hvKeys.find(x => x.id === id); if (k) hvCopy(k.key, "Key disalin"); }
async function hvRestore(id) { const { error } = await hvRpc("hs_restore_keys", { p_ids: [id] }); if (!error) { showToast("Key dipulihkan ke daftar", "success"); hvLoadBatches(hvSelected); } }
function hvDelete(id) {
    openConfirmModal({ icon: "🗑", iconClass: "danger", title: "Hapus key?", body: "Key ini akan dihapus permanen.", confirmText: "Ya, Hapus", confirmClass: "btn-danger",
        onConfirm: async () => { const { error } = await hvRpc("hs_delete_keys", { p_ids: [id] }); if (!error) hvLoadBatches(hvSelected); } });
}

/* ---- paste banyak key ---- */
function hvParse(text) {
    const keys = [], seen = new Set(); let invalid = 0, dup = 0;
    text.split(/[\s,;]+/).filter(Boolean).forEach(k => {
        if (!/^[A-Za-z0-9_.\-]{6,}$/.test(k)) { invalid++; return; }
        if (seen.has(k)) { dup++; return; }
        seen.add(k); keys.push(k);
    });
    return { keys, invalid, dup };
}
function hvPreview() {
    const v = hvEl("hvPaste").value, { keys, invalid, dup } = hvParse(v);
    hvEl("hvPreview").innerHTML = v.trim()
        ? `<b>${keys.length}</b> key valid` + (dup ? ` · ${dup} kembar dilewati` : "") + (invalid ? ` · <span style="color:var(--danger)">${invalid} tidak valid</span>` : "")
        : "Satu key per baris, contoh: <code>HAV_SVip3MuP7M</code>";
}
async function hvAdd() {
    if (!hvSelected) return;
    const { keys, invalid } = hvParse(hvEl("hvPaste").value);
    if (!keys.length) { showToast("Tidak ada key yang valid", "danger"); return; }
    const { data, error } = await hvRpc("hs_add_keys", { p_batch_id: hvSelected, p_keys: keys });
    if (error) return;
    hvEl("hvPaste").value = ""; hvPreview(); hvTab = "available";
    document.querySelectorAll("#hvTabs .tab").forEach(x => x.classList.toggle("active", x.dataset.tab === "available"));
    showToast(`${data.added} key ditambahkan` + (data.skipped ? `, ${data.skipped} sudah ada` : "") + (invalid ? `, ${invalid} tidak valid` : ""), "success");
    hvLoadBatches(hvSelected);
}

/* ---- ambil N key -> arsip (tampil key saja) ---- */
async function hvTake() {
    const b = hvById(hvSelected); if (!b) return;
    const n = parseInt(hvEl("hvTakeN").value, 10);
    if (!n || n < 1) { showToast("Masukkan jumlah key yang diambil", "danger"); return; }
    if (n > b.available) { showToast(`Stok hanya ${b.available} key`, "danger"); return; }
    const { data, error } = await hvRpc("hs_take_keys", { p_batch_id: b.id, p_count: n });
    if (error) return;
    const text = (data || []).join("\n");
    hvEl("hvTakeN").value = "";
    try { await navigator.clipboard.writeText(text); } catch (e) {}
    modalBox.innerHTML = `<div class="modal-icon success">🔑</div><div class="modal-title">${data.length} key diambil</div>
        <div class="modal-body">Sudah dipindahkan ke <b>Arsip Key</b>.</div>
        <textarea readonly rows="${Math.min(10, data.length + 1)}" style="width:100%;font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre;overflow:auto;margin-top:10px;">${escapeHtml(text)}</textarea>
        <div class="modal-actions"><button type="button" class="btn btn-ghost btn-wrap" id="modalCancelBtn">Tutup</button><button type="button" class="btn btn-primary btn-wrap" id="hvCopyTaken">📋 Salin Lagi</button></div>`;
    modalOverlay.classList.add("show");
    hvEl("modalCancelBtn").addEventListener("click", closeModal);
    hvEl("hvCopyTaken").addEventListener("click", () => hvCopy(text, "Key disalin"));
    hvLoadBatches(b.id);
}
