/**
 * FARM SELL — simpan token farm per batch (sql/farmsell.sql).
 * Paste banyak "id,token" sekaligus -> otomatis disaring, diberi nomor urut (nama),
 * masuk tabel. "Ambil N" -> N token teratas pindah ke Arsip Token.
 */
let fsPin = sessionStorage.getItem("akun_admin_pin") || null;
let fsBatches = [], fsTokens = [], fsSelected = null, fsTab = "available", fsInited = false;

const fsById = id => fsBatches.find(b => b.id === id) || null;
const fsEl = id => document.getElementById(id);
const fsWaktu = iso => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

async function fsRpc(name, params) {
    const res = await supabaseClient.rpc(name, { p_pin: fsPin, ...params });
    if (res.error) {
        console.error(res.error);
        if ((res.error.message || "").includes("PIN admin salah")) {
            fsPin = null; sessionStorage.removeItem("akun_admin_pin");
            fsEl("fsPinGate").style.display = "block"; fsEl("fsContent").style.display = "none";
            showToast("PIN admin tidak valid, masukkan ulang", "danger");
        } else if (/function .* does not exist|schema cache/i.test(res.error.message || "")) {
            showToast("Jalankan dulu sql/farmsell.sql di Supabase SQL Editor", "danger");
        } else {
            showToast(res.error.message || "Terjadi kesalahan", "danger");
        }
    }
    return res;
}

function initFarmSellPage() {
    if (!fsInited) { fsInited = true; fsBind(); }
    fsPin = sessionStorage.getItem("akun_admin_pin") || fsPin;
    if (fsPin) fsShow();
    else { fsEl("fsPinGate").style.display = "block"; fsEl("fsContent").style.display = "none"; }
}

function fsBind() {
    const submit = async () => {
        const pin = fsEl("fsPinInput").value;
        if (!pin) { showToast("Masukkan PIN admin", "danger"); return; }
        const { data, error } = await supabaseClient.rpc("admin_verify_pin", { p_pin: pin });
        if (error) { showToast("Error database: " + error.message, "danger"); return; }
        if (!data) { showToast("PIN admin salah", "danger"); return; }
        fsPin = pin; sessionStorage.setItem("akun_admin_pin", pin); fsEl("fsPinInput").value = "";
        fsShow();
    };
    fsEl("fsPinSubmit").addEventListener("click", submit);
    fsEl("fsPinInput").addEventListener("keydown", e => { if (e.key === "Enter") submit(); });

    fsEl("fsNewBatchBtn").addEventListener("click", () => fsNamePrompt("Batch Baru", "", async nama => {
        const { data, error } = await fsRpc("fs_create_batch", { p_nama: nama });
        if (!error) { showToast("Batch dibuat", "success"); fsLoadBatches(data); }
    }));
    fsEl("fsRenameBtn").addEventListener("click", () => { const b = fsById(fsSelected); if (b) fsNamePrompt("Ganti Nama Batch", b.nama, async nama => {
        const { error } = await fsRpc("fs_rename_batch", { p_id: b.id, p_nama: nama });
        if (!error) fsLoadBatches(b.id);
    }); });
    fsEl("fsDeleteBatchBtn").addEventListener("click", () => { const b = fsById(fsSelected); if (!b) return;
        openConfirmModal({ icon: "🗑", iconClass: "danger", title: `Hapus ${b.nama}?`,
            body: `Semua token di batch ini (${b.available} di daftar + ${b.taken} di arsip) akan terhapus permanen.`,
            confirmText: "Ya, Hapus", confirmClass: "btn-danger",
            onConfirm: async () => { const { error } = await fsRpc("fs_delete_batch", { p_id: b.id }); if (!error) { fsSelected = null; fsLoadBatches(); } } });
    });

    fsEl("fsPaste").addEventListener("input", fsPreview);
    fsEl("fsAddBtn").addEventListener("click", fsAdd);
    fsEl("fsTakeBtn").addEventListener("click", fsTake);
    fsEl("fsTakeN").addEventListener("keydown", e => { if (e.key === "Enter") fsTake(); });
    fsEl("fsCopyAllBtn").addEventListener("click", () => fsCopy(fsTokens.map(fsLine).join("\n"), `${fsTokens.length} token disalin`));
    document.querySelectorAll("#fsTabs .tab").forEach(t => t.addEventListener("click", () => {
        document.querySelectorAll("#fsTabs .tab").forEach(x => x.classList.remove("active"));
        t.classList.add("active"); fsTab = t.dataset.tab; fsLoadTokens();
    }));
}

async function fsShow() {
    fsEl("fsPinGate").style.display = "none"; fsEl("fsContent").style.display = "block";
    await fsLoadBatches();
}

/* ---- modal nama batch ---- */
function fsNamePrompt(title, value, onSave) {
    modalBox.innerHTML = `<div class="modal-icon info">🗃️</div><div class="modal-title">${escapeHtml(title)}</div>
        <div class="modal-form"><div class="field"><label for="fsNameIn">Nama Batch</label><input type="text" id="fsNameIn" value="${escapeHtml(value)}" placeholder="kosongkan = otomatis"></div></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost btn-wrap" id="modalCancelBtn">Batal</button><button type="button" class="btn btn-primary btn-wrap" id="fsNameSave">Simpan</button></div>`;
    modalOverlay.classList.add("show");
    const input = fsEl("fsNameIn"); input.focus();
    const save = () => { const v = input.value.trim(); closeModal(); onSave(v); };
    fsEl("modalCancelBtn").addEventListener("click", closeModal);
    fsEl("fsNameSave").addEventListener("click", save);
    input.addEventListener("keydown", e => { if (e.key === "Enter") save(); });
}

/* ---- batch ---- */
async function fsLoadBatches(selectId) {
    const { data, error } = await fsRpc("fs_list_batches", {});
    if (error) return;
    fsBatches = data || [];
    if (selectId && fsById(selectId)) fsSelected = selectId;
    else if (!fsById(fsSelected)) fsSelected = fsBatches.length ? fsBatches[fsBatches.length - 1].id : null;
    fsRenderBatches();
    await fsLoadTokens();
}

function fsRenderBatches() {
    fsEl("fsSumAvail").textContent = fsBatches.reduce((a, b) => a + Number(b.available), 0);
    fsEl("fsSumTaken").textContent = fsBatches.reduce((a, b) => a + Number(b.taken), 0);
    fsEl("fsSumBatch").textContent = fsBatches.length;
    fsEl("fsNoBatch").style.display = fsBatches.length ? "none" : "flex";
    fsEl("fsBatchList").innerHTML = fsBatches.map(b => `
        <button type="button" class="cf-batch-card ${b.id === fsSelected ? "selected" : ""}" onclick="fsSelect(${b.id})">
            <div class="cf-batch-card-top"><span class="cf-batch-name">${escapeHtml(b.nama)}</span>
                <span class="cf-pill ${b.available ? "pill-active" : "pill-withdrawn"}">${b.available ? "● Ada Stok" : "Habis"}</span></div>
            <div class="cf-batch-total">${b.available} <span style="font-size:12px;font-weight:500;color:var(--text-muted)">token</span></div>
            <div class="cf-batch-sub">${b.taken} di arsip · ${formatDateHuman(b.created_at)}</div>
        </button>`).join("");
    fsEl("fsBatchPanel").style.display = fsSelected ? "block" : "none";
    const b = fsById(fsSelected);
    if (b) { fsEl("fsBatchTitle").textContent = b.nama; fsEl("fsAvailInfo").textContent = `Tersedia: ${b.available} token`; fsEl("fsTakeN").max = b.available; }
}
function fsSelect(id) { fsSelected = id; fsRenderBatches(); fsLoadTokens(); }

/* ---- tabel token ---- */
const fsLine = t => `${t.no},${t.farm_id},${t.token}`;   // format: nama,id,token

async function fsLoadTokens() {
    if (!fsSelected) { fsTokens = []; return; }
    const { data, error } = await fsRpc("fs_list_tokens", { p_batch_id: fsSelected, p_status: fsTab });
    if (error) return;
    fsTokens = data || [];
    const arsip = fsTab === "taken";
    fsEl("fsHeadExtra").style.display = arsip ? "" : "none";
    fsEl("fsEmpty").style.display = fsTokens.length ? "none" : "flex";
    fsEl("fsEmptyText").textContent = arsip ? "Arsip token masih kosong" : "Belum ada token. Paste daftar id,token di atas lalu klik Tambahkan.";
    fsEl("fsBody").innerHTML = fsTokens.map((t, i) => `
        <tr><td class="col-no">${i + 1}</td><td><b>${t.no}</b></td><td class="mono">${escapeHtml(t.farm_id)}</td><td class="mono">${escapeHtml(t.token)}</td>
        ${arsip ? `<td>${fsWaktu(t.taken_at)}</td>` : ""}
        <td class="col-aksi"><div class="actions-cell">
            <button class="btn btn-outline btn-icon" title="Salin" onclick="fsCopyOne(${t.id})">📋</button>
            ${arsip ? `<button class="btn btn-ghost btn-icon" title="Pulihkan ke daftar" onclick="fsRestore(${t.id})">↩️</button>` : ""}
            <button class="btn btn-danger btn-icon" title="Hapus permanen" onclick="fsDelete(${t.id})">🗑</button>
        </div></td></tr>`).join("");
}

async function fsCopy(text, msg) {
    try { await navigator.clipboard.writeText(text); showToast(msg, "success"); }
    catch (e) { showToast("Gagal menyalin (izinkan clipboard di browser)", "danger"); }
}
function fsCopyOne(id) { const t = fsTokens.find(x => x.id === id); if (t) fsCopy(fsLine(t), "Token disalin"); }
async function fsRestore(id) { const { error } = await fsRpc("fs_restore_tokens", { p_ids: [id] }); if (!error) { showToast("Token dipulihkan ke daftar", "success"); fsLoadBatches(fsSelected); } }
function fsDelete(id) {
    openConfirmModal({ icon: "🗑", iconClass: "danger", title: "Hapus token?", body: "Token ini akan dihapus permanen.", confirmText: "Ya, Hapus", confirmClass: "btn-danger",
        onConfirm: async () => { const { error } = await fsRpc("fs_delete_tokens", { p_ids: [id] }); if (!error) fsLoadBatches(fsSelected); } });
}

/* ---- paste banyak token ---- */
function fsParse(text) {
    const rows = [], seen = new Set(); let invalid = 0, dup = 0;
    text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(line => {
        let p = line.split(/[,;\t]+/).map(s => s.trim()).filter(Boolean);
        if (p.length < 2) p = line.split(/\s+/).filter(Boolean);
        if (p.length < 2) { invalid++; return; }
        const token = p[p.length - 1], id = p[p.length - 2];   // abaikan kolom nama/nomor di depan
        if (!/^[\w.-]+$/.test(id) || !/^[A-Za-z0-9_.\-]{8,}$/.test(token)) { invalid++; return; }
        if (seen.has(token)) { dup++; return; }
        seen.add(token); rows.push({ id, token });
    });
    return { rows, invalid, dup };
}
function fsPreview() {
    const { rows, invalid, dup } = fsParse(fsEl("fsPaste").value);
    fsEl("fsPreview").innerHTML = fsEl("fsPaste").value.trim()
        ? `<b>${rows.length}</b> token valid` + (dup ? ` · ${dup} kembar dilewati` : "") + (invalid ? ` · <span style="color:var(--danger)">${invalid} baris tidak valid</span>` : "")
        : "Format per baris: <code>id,token</code> (boleh juga <code>nama,id,token</code>)";
}
async function fsAdd() {
    if (!fsSelected) return;
    const { rows, invalid } = fsParse(fsEl("fsPaste").value);
    if (!rows.length) { showToast("Tidak ada baris id,token yang valid", "danger"); return; }
    const { data, error } = await fsRpc("fs_add_tokens", { p_batch_id: fsSelected, p_rows: rows });
    if (error) return;
    fsEl("fsPaste").value = ""; fsPreview(); fsTab = "available";
    document.querySelectorAll("#fsTabs .tab").forEach(x => x.classList.toggle("active", x.dataset.tab === "available"));
    showToast(`${data.added} token ditambahkan` + (data.skipped ? `, ${data.skipped} sudah ada` : "") + (invalid ? `, ${invalid} baris tidak valid` : ""), "success");
    fsLoadBatches(fsSelected);
}

/* ---- ambil N token -> arsip ---- */
async function fsTake() {
    const b = fsById(fsSelected); if (!b) return;
    const n = parseInt(fsEl("fsTakeN").value, 10);
    if (!n || n < 1) { showToast("Masukkan jumlah token yang diambil", "danger"); return; }
    if (n > b.available) { showToast(`Stok hanya ${b.available} token`, "danger"); return; }
    const { data, error } = await fsRpc("fs_take_tokens", { p_batch_id: b.id, p_count: n });
    if (error) return;
    const text = (data || []).map(fsLine).join("\n");
    fsEl("fsTakeN").value = "";
    try { await navigator.clipboard.writeText(text); } catch (e) {}
    modalBox.innerHTML = `<div class="modal-icon success">🌱</div><div class="modal-title">${data.length} token diambil</div>
        <div class="modal-body">Sudah dipindahkan ke <b>Arsip Token</b>. Format: <code>nama,id,token</code></div>
        <textarea readonly rows="${Math.min(10, data.length + 1)}" style="width:100%;font-family:ui-monospace,Menlo,monospace;font-size:11px;white-space:pre;overflow:auto;margin-top:10px;">${escapeHtml(text)}</textarea>
        <div class="modal-actions"><button type="button" class="btn btn-ghost btn-wrap" id="modalCancelBtn">Tutup</button><button type="button" class="btn btn-primary btn-wrap" id="fsCopyTaken">📋 Salin Lagi</button></div>`;
    modalOverlay.classList.add("show");
    fsEl("modalCancelBtn").addEventListener("click", closeModal);
    fsEl("fsCopyTaken").addEventListener("click", () => fsCopy(text, "Token disalin"));
    fsLoadBatches(b.id);
}
