/**
 * ====================================================================
 * TAGAR — Input massal & auto-bagi tabel (Supabase tabel `tagar_batches`)
 * ====================================================================
 * Alur:
 * 1. Admin tempel/ketik daftar tagar (satu per baris, atau dipisah koma)
 *    di textarea. Statistik ringan (total/unik/duplikat) update live.
 * 2. Klik "Input & Bagi Tagar" -> tagar dipecah otomatis jadi beberapa
 *    tabel, maksimal 200 tagar/tabel, minimal 100/tabel (kecuali total
 *    tagar memang di bawah 100), lalu disimpan sebagai satu "batch".
 * 3. Duplikat (case-insensitive) dilaporkan lengkap dengan posisi baris
 *    aslinya, tanpa dihapus otomatis dari daftar.
 * 4. Riwayat batch sebelumnya bisa dibuka kembali, disalin ulang, atau
 *    dihapus.
 * ====================================================================
 */

const TAGAR_MAX_PER_GROUP = 200;
const TAGAR_MIN_PER_GROUP = 100;

/**
 * Parse teks bebas jadi daftar tagar. Pemisah yang didukung: baris baru
 * dan koma. Baris kosong diabaikan, spasi di ujung tagar dirapikan.
 */
function parseTagarBulk(rawText) {
    const tokens = (rawText || "")
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean);

    const countMap = new Map();
    const firstSeen = new Map();
    const positions = new Map();

    tokens.forEach((t, i) => {
        const key = t.toLowerCase();
        countMap.set(key, (countMap.get(key) || 0) + 1);
        if (!firstSeen.has(key)) firstSeen.set(key, t);
        if (!positions.has(key)) positions.set(key, []);
        positions.get(key).push(i + 1);
    });

    const duplicates = [];
    countMap.forEach((count, key) => {
        if (count > 1) {
            duplicates.push({
                tagar: firstSeen.get(key),
                count,
                positions: positions.get(key)
            });
        }
    });
    duplicates.sort((a, b) => b.count - a.count);

    return {
        tokens,
        total: tokens.length,
        uniqueCount: countMap.size,
        duplicateCount: tokens.length - countMap.size,
        duplicates
    };
}

/**
 * Bagi daftar tagar jadi beberapa grup/tabel dengan aturan:
 * - Maksimal TAGAR_MAX_PER_GROUP (200) tagar per grup.
 * - Minimal TAGAR_MIN_PER_GROUP (100) per grup, KECUALI totalnya sendiri
 *   di bawah 100 (tidak mungkin dipaksa lebih banyak dari yang ada).
 * - Grup dibagi serata mungkin (selisih antar grup maksimal 1 tagar),
 *   bukan "diisi penuh 200 lalu sisa dibuang ke grup terakhir" — supaya
 *   tidak pernah ada grup kecil yang timpang (mis. 200 + 20).
 */
function splitTagarIntoGroups(tokens) {
    const n = tokens.length;
    if (n <= TAGAR_MAX_PER_GROUP) {
        return [tokens.slice()];
    }

    const k = Math.ceil(n / TAGAR_MAX_PER_GROUP);
    const base = Math.floor(n / k);
    const remainder = n % k;

    const groups = [];
    let idx = 0;
    for (let i = 0; i < k; i++) {
        const size = base + (i < remainder ? 1 : 0);
        groups.push(tokens.slice(idx, idx + size));
        idx += size;
    }
    return groups;
}

/* ---------------- Live preview saat mengetik (belum disimpan) ---------------- */

function updateTagarLivePreview() {
    const textarea = document.getElementById("tagarBulkInput");
    const chipTotal = document.getElementById("tagarLiveTotal");
    const chipUnique = document.getElementById("tagarLiveUnique");
    const chipDup = document.getElementById("tagarLiveDup");
    if (!textarea || !chipTotal) return;

    const parsed = parseTagarBulk(textarea.value);

    chipTotal.innerText = `Total: ${parsed.total}`;
    chipUnique.innerText = `Unik: ${parsed.uniqueCount}`;

    if (parsed.duplicateCount > 0) {
        chipDup.className = "chip chip-danger";
        chipDup.innerText = `⚠️ ${parsed.duplicateCount} Duplikat`;
    } else {
        chipDup.className = "chip chip-success";
        chipDup.innerText = "✅ Tidak Ada Duplikat";
    }

    const estGroups = parsed.total > 0 ? splitTagarIntoGroups(parsed.tokens).length : 0;
    document.getElementById("tagarLiveGroups").innerText = `Perkiraan Tabel: ${estGroups}`;
}

/* ---------------- Proses & Simpan Batch ---------------- */

async function handleProcessTagar() {
    const textarea = document.getElementById("tagarBulkInput");
    const rawText = textarea.value;
    const parsed = parseTagarBulk(rawText);

    if (parsed.total === 0) {
        showToast("Masukkan minimal satu tagar terlebih dahulu", "danger");
        return;
    }

    const groups = splitTagarIntoGroups(parsed.tokens);

    const { data, error } = await supabaseClient
        .from("tagar_batches")
        .insert([{
            raw_input: rawText.trim(),
            total_tagar: parsed.total,
            unique_tagar: parsed.uniqueCount,
            duplicate_count: parsed.duplicateCount,
            group_count: groups.length,
            groups: groups,
            duplicates: parsed.duplicates
        }])
        .select()
        .single();

    if (error) {
        console.error(error);
        showToast("Gagal memproses & menyimpan tagar", "danger");
        return;
    }

    showToast(`${parsed.total} tagar berhasil dibagi jadi ${groups.length} tabel`, "success");
    renderTagarActiveResult(data);
    loadTagarHistory();
}

/* ---------------- Render hasil aktif (setelah diproses) ---------------- */

function renderTagarActiveResult(batch) {
    const container = document.getElementById("tagarActiveResult");
    if (!container) return;

    const duplicates = batch.duplicates || [];
    const groups = batch.groups || [];

    const duplicateHtml = duplicates.length > 0
        ? `
            <div class="tagar-duplicate-panel">
                <div class="tdp-title">⚠️ ${duplicates.length} Tagar Terdeteksi Duplikat</div>
                <div class="tagar-duplicate-list">
                    ${duplicates.map(d => `
                        <div class="tagar-duplicate-item">
                            <span class="tdi-name">${escapeHtml(d.tagar)}</span>
                            <span class="tdi-meta">${d.count}× &middot; baris ${d.positions.join(", ")}</span>
                        </div>
                    `).join("")}
                </div>
            </div>
        `
        : `
            <div class="tagar-clean-panel">✅ Tidak ada tagar duplikat — semua tagar unik.</div>
        `;

    const groupsHtml = groups.map((group, gi) => {
        const dupKeys = new Set(duplicates.map(d => d.tagar.toLowerCase()));
        const linesHtml = group.map((tag, ti) => {
            const isDup = dupKeys.has(tag.toLowerCase());
            return `<div class="tg-line"><span class="tg-idx ${isDup ? "is-dup" : ""}">${ti + 1}.</span><span>${escapeHtml(tag)}</span></div>`;
        }).join("");

        return `
            <div class="tagar-group-card">
                <div class="tgc-head">
                    <span class="tgc-title">🏷️ Tabel ${gi + 1}</span>
                    <span class="chip chip-info">${group.length} tagar</span>
                </div>
                <div class="tagar-group-box">${linesHtml}</div>
                <button type="button" class="btn btn-outline" style="width:100%;" onclick="copyTagarGroup(${batch.id}, ${gi})">📋 Salin Tabel ${gi + 1}</button>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <section class="panel">
            <div class="tagar-result-header">
                <div class="panel-title" style="margin-bottom:0;">📊 Hasil Pembagian Tagar</div>
                <button type="button" class="btn btn-primary" onclick="copyAllTagarBatch(${batch.id})">📑 Salin Semua Tagar</button>
            </div>

            <div class="tagar-stats-row" style="margin-bottom:16px;">
                <span class="chip chip-info">Total Tagar: ${batch.total_tagar}</span>
                <span class="chip chip-info">Tagar Unik: ${batch.unique_tagar}</span>
                <span class="chip ${batch.duplicate_count > 0 ? "chip-danger" : "chip-success"}">
                    ${batch.duplicate_count > 0 ? `⚠️ ${batch.duplicate_count} Duplikat` : "✅ Tidak Ada Duplikat"}
                </span>
                <span class="chip chip-info">📁 ${batch.group_count} Tabel Dihasilkan</span>
            </div>

            ${duplicateHtml}

            <div class="tagar-groups-grid">
                ${groupsHtml}
            </div>
        </section>
    `;

    // simpan batch aktif di memori supaya tombol salin bisa akses tanpa fetch ulang
    window._activeTagarBatch = batch;
}

/* ---------------- Copy actions ---------------- */

async function copyTagarGroup(batchId, groupIndex) {
    const batch = await getTagarBatchById(batchId);
    if (!batch) return;

    const group = batch.groups[groupIndex] || [];
    if (group.length === 0) {
        showToast("Tabel ini kosong", "danger");
        return;
    }

    try {
        await navigator.clipboard.writeText(group.join("\n"));
        showToast(`Tabel ${groupIndex + 1} (${group.length} tagar) berhasil disalin`, "success");
    } catch (err) {
        console.error(err);
        showToast("Gagal menyalin tabel", "danger");
    }
}

async function copyAllTagarBatch(batchId) {
    const batch = await getTagarBatchById(batchId);
    if (!batch) return;

    const allTags = (batch.groups || []).flat();
    if (allTags.length === 0) {
        showToast("Tidak ada tagar untuk disalin", "danger");
        return;
    }

    try {
        await navigator.clipboard.writeText(allTags.join("\n"));
        showToast(`Semua ${allTags.length} tagar berhasil disalin`, "success");
    } catch (err) {
        console.error(err);
        showToast("Gagal menyalin tagar", "danger");
    }
}

async function getTagarBatchById(id) {
    if (window._activeTagarBatch && window._activeTagarBatch.id === id) {
        return window._activeTagarBatch;
    }

    const { data, error } = await supabaseClient
        .from("tagar_batches")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) {
        showToast("Gagal memuat data batch tagar", "danger");
        return null;
    }
    return data;
}

/* ---------------- Riwayat Batch ---------------- */

async function loadTagarHistory() {
    const container = document.getElementById("tagarHistoryList");
    const emptyState = document.getElementById("tagarHistoryEmpty");
    if (!container) return;

    const { data, error } = await supabaseClient
        .from("tagar_batches")
        .select("*")
        .order("id", { ascending: false });

    if (error) {
        console.error(error);
        showToast("Gagal memuat riwayat tagar", "danger");
        return;
    }

    const list = data || [];

    if (list.length === 0) {
        container.innerHTML = "";
        emptyState.style.display = "flex";
        return;
    }
    emptyState.style.display = "none";

    // tampilkan hasil paling baru sebagai "hasil aktif" jika belum ada yang tampil
    if (!window._activeTagarBatch && list.length > 0) {
        renderTagarActiveResult(list[0]);
    }

    container.innerHTML = list.map(batch => `
        <div class="tagar-history-item">
            <div class="tagar-history-head" onclick="toggleTagarHistoryItem(${batch.id})">
                <div class="thh-info">
                    <span class="thh-summary">🏷️ ${batch.total_tagar} tagar &middot; ${batch.group_count} tabel${batch.duplicate_count > 0 ? ` &middot; ⚠️ ${batch.duplicate_count} duplikat` : ""}</span>
                    <span class="thh-date">${formatDateHuman(batch.created_at)}</span>
                </div>
                <div class="actions-cell" onclick="event.stopPropagation()">
                    <button type="button" class="btn btn-outline btn-icon" onclick="showTagarBatchInActive(${batch.id})" title="Tampilkan di atas">👁️</button>
                    <button type="button" class="btn btn-danger btn-icon" onclick="deleteTagarBatch(${batch.id})" title="Hapus">🗑</button>
                </div>
            </div>
            <div class="tagar-history-body" id="tagarHistoryBody-${batch.id}"></div>
        </div>
    `).join("");
}

async function showTagarBatchInActive(id) {
    const batch = await getTagarBatchById(id);
    if (!batch) return;
    renderTagarActiveResult(batch);
    document.getElementById("tagarActiveResult").scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleTagarHistoryItem(id) {
    const body = document.getElementById(`tagarHistoryBody-${id}`);
    if (!body) return;

    const isOpen = body.classList.contains("open");
    if (isOpen) {
        body.classList.remove("open");
        body.innerHTML = "";
        return;
    }

    getTagarBatchById(id).then(batch => {
        if (!batch) return;
        body.innerHTML = (batch.groups || []).map((group, gi) => `
            <div class="tagar-group-card" style="margin-bottom:10px;">
                <div class="tgc-head">
                    <span class="tgc-title">Tabel ${gi + 1}</span>
                    <span class="chip chip-info">${group.length} tagar</span>
                </div>
                <div class="tagar-group-box">${group.map((t, ti) => `<div class="tg-line"><span class="tg-idx">${ti + 1}.</span><span>${escapeHtml(t)}</span></div>`).join("")}</div>
                <button type="button" class="btn btn-outline" style="width:100%;" onclick="copyTagarGroup(${batch.id}, ${gi})">📋 Salin Tabel ${gi + 1}</button>
            </div>
        `).join("");
        body.classList.add("open");
    });
}

function deleteTagarBatch(id) {
    openConfirmModal({
        icon: "🗑",
        iconClass: "danger",
        title: "Hapus Riwayat Tagar?",
        body: "Batch tagar ini beserta seluruh tabel hasil pembagiannya akan dihapus permanen.",
        confirmText: "Ya, Hapus",
        confirmClass: "btn-danger",
        onConfirm: async () => {
            await supabaseClient.from("tagar_batches").delete().eq("id", id);

            if (window._activeTagarBatch && window._activeTagarBatch.id === id) {
                window._activeTagarBatch = null;
                document.getElementById("tagarActiveResult").innerHTML = "";
            }

            showToast("Riwayat tagar dihapus", "danger");
            loadTagarHistory();
        }
    });
}
