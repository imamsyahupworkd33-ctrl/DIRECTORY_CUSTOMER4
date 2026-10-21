/**
 * PENGUMUMAN untuk dashboard pelanggan (admin) — sql/supply.sql (tabel announcements).
 */
let anList = [], anEditId = null, anInited = false;
const anEl = id => document.getElementById(id);

function initAnnouncePage() {
    if (!anInited) { anInited = true; anBind(); }
    spPin = sessionStorage.getItem("akun_admin_pin") || spPin;
    if (spPin) anShow();
    else { anEl("anPinGate").style.display = "block"; anEl("anContent").style.display = "none"; }
}
function anBind() {
    const submit = async () => {
        const pin = anEl("anPinInput").value;
        if (!pin) { showToast("Masukkan PIN admin", "danger"); return; }
        const { data, error } = await supabaseClient.rpc("admin_verify_pin", { p_pin: pin });
        if (error) { showToast("Error database: " + error.message, "danger"); return; }
        if (!data) { showToast("PIN admin salah", "danger"); return; }
        spPin = pin; sessionStorage.setItem("akun_admin_pin", pin); anEl("anPinInput").value = "";
        anShow();
    };
    anEl("anPinSubmit").addEventListener("click", submit);
    anEl("anPinInput").addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
    anEl("anSaveBtn").addEventListener("click", anSave);
    anEl("anResetBtn").addEventListener("click", anReset);
}
async function anShow() { anEl("anPinGate").style.display = "none"; anEl("anContent").style.display = "block"; await anLoad(); }

function anReset() {
    anEditId = null;
    ["anJudul", "anIsi", "anEnds"].forEach(i => anEl(i).value = "");
    anEl("anTarget").value = "semua"; anEl("anPinned").checked = false; anEl("anAktif").checked = true;
    anEl("anFormTitle").textContent = "➕ Buat Pengumuman"; anEl("anSaveBtn").textContent = "📣 Terbitkan"; anEl("anResetBtn").style.display = "none";
}
async function anSave() {
    const judul = anEl("anJudul").value.trim();
    if (!judul) { showToast("Judul wajib diisi", "danger"); return; }
    const ends = anEl("anEnds").value;
    const { error } = await spRpc("an_save", {
        p_id: anEditId, p_judul: judul, p_isi: anEl("anIsi").value.trim(), p_target: anEl("anTarget").value,
        p_pinned: anEl("anPinned").checked, p_aktif: anEl("anAktif").checked, p_ends_at: ends ? new Date(ends + "T23:59:59").toISOString() : null
    });
    if (error) return;
    showToast(anEditId ? "Pengumuman diperbarui" : "Pengumuman diterbitkan", "success");
    anReset(); anLoad();
}
async function anLoad() {
    const { data, error } = await spRpc("an_list", {});
    if (error) return;
    anList = data || [];
    anEl("anEmpty").style.display = anList.length ? "none" : "flex";
    anEl("anBody").innerHTML = anList.map((a, i) => {
        const expired = a.ends_at && new Date(a.ends_at) < new Date();
        const st = !a.aktif ? `<span class="badge">⏸ Nonaktif</span>` : expired ? `<span class="badge badge-warn">⌛ Berakhir</span>` : `<span class="badge badge-done">● Tayang</span>`;
        return `<tr><td class="col-no">${i + 1}</td><td><b>${a.pinned ? "📌 " : ""}${escapeHtml(a.judul)}</b><div class="cell-sub">${escapeHtml((a.isi || "").slice(0, 80))}</div></td>
            <td>${a.target === "semua" ? "Semua" : a.target}</td><td>${a.ends_at ? new Date(a.ends_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "Tanpa batas"}</td><td>${st}</td>
            <td class="col-aksi"><div class="actions-cell">
                <button class="btn btn-outline btn-icon" title="${a.aktif ? "Nonaktifkan" : "Aktifkan"}" onclick="anToggle(${a.id})">${a.aktif ? "⏸" : "▶️"}</button>
                <button class="btn btn-outline btn-icon" title="Ubah" onclick="anEdit(${a.id})">✏️</button>
                <button class="btn btn-danger btn-icon" title="Hapus" onclick="anDelete(${a.id})">🗑</button></div></td></tr>`;
    }).join("");
}
function anPayload(a, over) {
    return Object.assign({ p_id: a.id, p_judul: a.judul, p_isi: a.isi, p_target: a.target, p_pinned: a.pinned, p_aktif: a.aktif, p_ends_at: a.ends_at }, over);
}
async function anToggle(id) { const a = anList.find(x => x.id === id); if (!a) return;
    const { error } = await spRpc("an_save", anPayload(a, { p_aktif: !a.aktif })); if (!error) anLoad(); }
function anEdit(id) {
    const a = anList.find(x => x.id === id); if (!a) return;
    anEditId = id;
    anEl("anJudul").value = a.judul; anEl("anIsi").value = a.isi || ""; anEl("anTarget").value = a.target;
    anEl("anPinned").checked = a.pinned; anEl("anAktif").checked = a.aktif;
    anEl("anEnds").value = a.ends_at ? a.ends_at.slice(0, 10) : "";
    anEl("anFormTitle").textContent = "✏️ Ubah Pengumuman"; anEl("anSaveBtn").textContent = "💾 Simpan Perubahan"; anEl("anResetBtn").style.display = "";
    anEl("anJudul").scrollIntoView({ behavior: "smooth", block: "center" });
}
function anDelete(id) {
    openConfirmModal({ icon: "🗑", iconClass: "danger", title: "Hapus pengumuman?", body: "Pengumuman akan hilang dari dashboard pelanggan.", confirmText: "Ya, Hapus", confirmClass: "btn-danger",
        onConfirm: async () => { const { error } = await spRpc("an_delete", { p_id: id }); if (!error) anLoad(); } });
}
