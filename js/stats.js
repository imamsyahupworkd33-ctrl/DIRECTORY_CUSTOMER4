/**
 * STATISTIK — jumlah langganan per bulan + total BEM / SEM / LEM.
 * Sumber data: tabel `orders` (aktif) + `archives` (arsip), berdasarkan created_at.
 */
let _stCharts = {};

function _stKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

async function loadStatistik() {
    if (typeof Chart === "undefined") { showToast("Library chart gagal dimuat (cek koneksi)", "danger"); return; }

    const [a, b] = await Promise.all([
        supabaseClient.from("orders").select("dashboard,created_at"),
        supabaseClient.from("archives").select("dashboard,created_at")
    ]);
    if (a.error) { console.error(a.error); showToast("Gagal memuat statistik", "danger"); return; }
    const rows = [...(a.data || []), ...(b.data || [])];

    const tot = { BEM: 0, SEM: 0, LEM: 0 };
    const perBulan = {};
    rows.forEach(r => {
        const k = (r.dashboard || "").toUpperCase();
        if (k in tot) tot[k]++;
        if (!r.created_at || !(k in tot)) return;
        const m = _stKey(new Date(r.created_at));
        (perBulan[m] = perBulan[m] || { BEM: 0, SEM: 0, LEM: 0 })[k]++;
    });

    document.getElementById("stBEM").innerText = tot.BEM;
    document.getElementById("stSEM").innerText = tot.SEM;
    document.getElementById("stLEM").innerText = tot.LEM;
    document.getElementById("stAll").innerText = tot.BEM + tot.SEM + tot.LEM;

    // 12 bulan terakhir (urut, bulan kosong tetap tampil = 0)
    const now = new Date(), keys = [], labels = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        keys.push(_stKey(d));
        labels.push(`${BULAN_SINGKAT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`);
    }
    const ser = t => keys.map(k => (perBulan[k] ? perBulan[k][t] : 0));
    const total = keys.map(k => perBulan[k] ? perBulan[k].BEM + perBulan[k].SEM + perBulan[k].LEM : 0);

    const GOLD = "#D4AF6A", SILVER = "#A8B0C0", ROSE = "#C97B84";
    Chart.defaults.color = "#9A9AA8";
    Chart.defaults.font.family = "Inter, sans-serif";
    const grid = { color: "rgba(255,255,255,.06)" };
    const draw = (id, cfg) => { if (_stCharts[id]) _stCharts[id].destroy(); _stCharts[id] = new Chart(document.getElementById(id), cfg); };
    const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8 } } } };

    draw("chartBulan", { type: "bar", data: { labels, datasets: [
        { label: "BEM", data: ser("BEM"), backgroundColor: GOLD, borderRadius: 4 },
        { label: "SEM", data: ser("SEM"), backgroundColor: SILVER, borderRadius: 4 },
        { label: "LEM", data: ser("LEM"), backgroundColor: ROSE, borderRadius: 4 }
    ] }, options: { ...base, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid } } } });

    draw("chartKomposisi", { type: "doughnut", data: { labels: ["BEM", "SEM", "LEM"], datasets: [{ data: [tot.BEM, tot.SEM, tot.LEM], backgroundColor: [GOLD, SILVER, ROSE], borderColor: "#111114", borderWidth: 3 }] },
        options: { ...base, cutout: "68%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } } } });

    draw("chartTren", { type: "line", data: { labels, datasets: [{ label: "Total", data: total, borderColor: GOLD, backgroundColor: "rgba(212,175,106,.14)", fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: GOLD }] },
        options: { ...base, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid } } } });
}


/**
 * Statistik per dashboard (BEM / SEM / LEM) — dipanggil dari loadData().
 */
async function renderDashStats(activeData, st) {
    if (typeof Chart === "undefined") return;
    const dash = currentDashboard;
    document.getElementById("dsLabel").innerText = dash;
    document.getElementById("dsLabel2").innerText = dash;

    const arc = await supabaseClient.from("archives").select("created_at").eq("dashboard", dash);
    const rows = [...activeData, ...((arc.data) || [])];
    const per = {};
    rows.forEach(r => { if (r.created_at) { const k = _stKey(new Date(r.created_at)); per[k] = (per[k] || 0) + 1; } });

    const now = new Date(), keys = [], labels = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        keys.push(_stKey(d)); labels.push(`${BULAN_SINGKAT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`);
    }
    Chart.defaults.color = "#9A9AA8";
    Chart.defaults.font.family = "Inter, sans-serif";
    const draw = (id, cfg) => { if (_stCharts[id]) _stCharts[id].destroy(); _stCharts[id] = new Chart(document.getElementById(id), cfg); };
    const base = { responsive: true, maintainAspectRatio: false };

    draw("dsBulan", { type: "bar", data: { labels, datasets: [{ label: dash, data: keys.map(k => per[k] || 0), backgroundColor: "#D4AF6A", borderRadius: 4 }] },
        options: { ...base, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(255,255,255,.06)" } } } } });

    draw("dsStatus", { type: "doughnut", data: { labels: ["Proses", "Mendekati Limit", "Selesai"], datasets: [{ data: [st.proses, st.mendekati, st.selesai], backgroundColor: ["#D4AF6A", "#E0707F", "#5FC79A"], borderColor: "#111114", borderWidth: 3 }] },
        options: { ...base, cutout: "66%", plugins: { legend: { position: "right", labels: { usePointStyle: true, boxWidth: 8 } } } } });
}
