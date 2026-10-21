document.addEventListener("DOMContentLoaded", async () => {
    try {
        await resetDailyUTC();
        await loadData();
    } catch (err) {
        console.error(err);
        showToast("Gagal memuat dashboard", "danger");
    }
});
