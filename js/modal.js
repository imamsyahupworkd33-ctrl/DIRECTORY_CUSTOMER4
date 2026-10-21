/**
 * Modal component sederhana & reusable.
 * Dipakai untuk: konfirmasi delete, konfirmasi simpan ke arsip, dan form edit.
 */

const modalOverlay = document.getElementById("modalOverlay");
const modalBox = document.getElementById("modalBox");

function closeModal() {
    modalOverlay.classList.remove("show");
    modalBox.innerHTML = "";
}

modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
});

/**
 * Modal konfirmasi generik.
 * options: { icon, iconClass, title, body, confirmText, confirmClass, onConfirm }
 */
function openConfirmModal(options) {
    const {
        icon = "❓",
        iconClass = "info",
        title = "Konfirmasi",
        body = "Apakah Anda yakin?",
        confirmText = "Konfirmasi",
        confirmClass = "btn-primary",
        onConfirm = () => {}
    } = options;

    modalBox.innerHTML = `
        <div class="modal-icon ${iconClass}">${icon}</div>
        <div class="modal-title">${escapeHtml(title)}</div>
        <div class="modal-body">${body}</div>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost btn-wrap" id="modalCancelBtn">Batal</button>
            <button type="button" class="btn ${confirmClass} btn-wrap" id="modalConfirmBtn">${escapeHtml(confirmText)}</button>
        </div>
    `;

    modalOverlay.classList.add("show");

    document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
    document.getElementById("modalConfirmBtn").addEventListener("click", () => {
        onConfirm();
        closeModal();
    });
}

/**
 * Modal form edit pesanan.
 */
function openEditModal(order, onSave) {
    modalBox.innerHTML = `
        <div class="modal-icon info">✏️</div>
        <div class="modal-title">Edit Pesanan</div>
        <div class="modal-form">
            <div class="field">
                <label for="editNomor">Nama Pemesan</label>
                <input type="text" id="editNomor" value="${escapeHtml(order.nomor_pesanan)}">
            </div>
            <div class="field">
                <label for="editTagar">Tagar</label>
                <input type="text" id="editTagar" value="${escapeHtml(order.tagar)}">
            </div>
            <div class="field">
                <label for="editWa">WhatsApp</label>
                <input type="text" id="editWa" value="${escapeHtml(order.nomor_whatsapp || "")}">
            </div>
            <div class="field">
                <label for="editPaket">Jumlah Paket (Limit)</label>
                <input type="number" id="editPaket" min="1" value="${escapeHtml(order.paket_total)}">
            </div>
            <div class="field">
                <label for="editTerkirim">Paket Terkirim (Hari Sudah Diceklis)</label>
                <input type="number" id="editTerkirim" min="0" value="${escapeHtml(order.paket_terkirim)}">
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
        const nomor = document.getElementById("editNomor").value.trim();
        const tagar = document.getElementById("editTagar").value.trim();
        const wa = document.getElementById("editWa").value.trim();
        const paket = parseInt(document.getElementById("editPaket").value);
        const terkirim = parseInt(document.getElementById("editTerkirim").value);

        if (!nomor || !tagar || !paket || paket < 1) {
            showToast("Lengkapi semua data dengan benar", "danger");
            return;
        }
        if (isNaN(terkirim) || terkirim < 0) {
            showToast("Paket terkirim harus diisi dengan angka yang valid", "danger");
            return;
        }
        if (terkirim > paket) {
            showToast("Paket terkirim tidak boleh melebihi jumlah paket (limit)", "danger");
            return;
        }
        if (wa && !validWhatsapp(wa)) {
            showToast("Format WA harus diawali tanda +", "danger");
            return;
        }

        onSave({ nomor, tagar, wa, paket, terkirim });
        closeModal();
    });
}
