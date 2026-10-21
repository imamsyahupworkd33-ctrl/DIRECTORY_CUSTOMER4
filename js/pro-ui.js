/**
 * Helper tampilan: format tanggal + pengurutan kolom tabel Dashboard.
 */
const BULAN_SINGKAT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function fmtTanggal(d) {
    return `${d.getDate()} ${BULAN_SINGKAT[d.getMonth()]} ${d.getFullYear()}`;
}

function addDays(date, n) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
}

/* ---------------- Pengurutan kolom tabel Dashboard ---------------- */
let dashSortKey = null;
let dashSortDir = 1; // 1 = naik, -1 = turun

const DASH_SORT_FIELDS = {
    nama:    { attr: "nama",       text: true },
    tagar:   { attr: "tagar",      text: true },
    status:  { attr: "statusRank", text: false },
    persen:  { attr: "persen",     text: false },
    mulai:   { attr: "mulai",      text: false },
    selesai: { attr: "selesai",    text: false },
    sisa:    { attr: "sisa",       text: false }
};

function applyDashboardSort() {
    const body = document.getElementById("tableBody");
    if (!body) return;

    document.querySelectorAll("#dashboardTable th.sortable").forEach(th => {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.dataset.sort === dashSortKey) th.classList.add(dashSortDir === 1 ? "sort-asc" : "sort-desc");
    });

    const rows = Array.from(body.querySelectorAll("tr"));

    if (dashSortKey && DASH_SORT_FIELDS[dashSortKey]) {
        const f = DASH_SORT_FIELDS[dashSortKey];
        rows.sort((a, b) => {
            const va = a.dataset[f.attr] ?? "";
            const vb = b.dataset[f.attr] ?? "";
            const cmp = f.text ? String(va).localeCompare(String(vb), "id") : (Number(va) - Number(vb));
            return cmp * dashSortDir;
        });
        rows.forEach(r => body.appendChild(r));
    }

    // nomor urut mengikuti urutan tampil
    let n = 1;
    body.querySelectorAll("tr").forEach(r => {
        const cell = r.querySelector(".col-no");
        if (cell) cell.textContent = n++;
    });
}

document.addEventListener("click", (e) => {
    const th = e.target.closest("#dashboardTable th.sortable");
    if (!th) return;
    const key = th.dataset.sort;
    if (dashSortKey === key) {
        dashSortDir = -dashSortDir;
    } else {
        dashSortKey = key;
        dashSortDir = 1;
    }
    applyDashboardSort();
});
