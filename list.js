// ============================================================================
// YUTEPIA - 7 EVRENLİ LİSTE, KATALOG ARAMA VE LOGLAMA MODÜLÜ (list.js)
// ============================================================================

let activeCategorySubTab = 'home'; // 'home', 'list', 'reviews', 'community'
let activeListViewMode = 'my_list'; // 'my_list' (Benim Listem) veya 'discover' (Katalogda Ara & Ekle)
let activeStatusFilter = 'all'; // 'all', 'completed', 'watching', 'plan', 'dropped', 'favorite'

let myCategoryLogs = [];
let catalogDiscoverItems = [];
let categoryFeedItems = [];
let selectedMediaForLog = null;

let catalogSearchTimer = null;
let catalogAbortController = null;

// Hızlı geçişler için RAM önbellekleri
const discoverMemoryCache = new Map();
const userListMemoryCache = new Map();
const feedMemoryCache = new Map();

const STATUS_LABELS = {
    completed: '✅ Tamamlandı',
    watching: '▶️ Devam Ediyor',
    plan: '📅 Planlanan',
    dropped: '❌ Bırakıldı'
};

// 1. FRUTIGER AERO LİSTE STİLLERİNİ VE LOGLAMA MODALINI ENJEKTE ET
(function mountListModule() {
    const styleEl = document.createElement('style');
    styleEl.id = 'yutepia-list-styles';
    styleEl.textContent = `
        .list-subtabs-bar {
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
            margin: 12px 0 10px 0; flex-wrap: wrap; position: relative; z-index: 2;
        }
        .list-mode-switch {
            display: flex; gap: 6px; flex: 1; min-width: 260px;
        }
        .list-mode-btn {
            flex: 1; padding: 8px 12px; border-radius: 14px; font-size: 13px; font-weight: 900;
            color: #fff; cursor: pointer; text-align: center;
            border: 1.5px solid rgba(255, 255, 255, 0.8);
            background: rgba(255, 255, 255, 0.22);
            text-shadow: 0 1px 2px rgba(0, 30, 75, 0.9);
            transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
        }
        .list-mode-btn:hover { background: rgba(255, 255, 255, 0.38); }
        .list-mode-btn.active {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(var(--panel-r), var(--panel-g), var(--panel-b), 0.92) 100%);
            border-color: #ffffff;
            box-shadow: 0 4px 12px rgba(0, 40, 95, 0.35), inset 0 1px 3px #fff;
            color: #002b55;
            text-shadow: 0 1px 0 #fff;
        }

        .status-filter-row {
            display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 12px; position: relative; z-index: 2;
        }
        .status-pill-btn {
            padding: 5px 11px; border-radius: 12px; font-size: 11.5px; font-weight: 800;
            color: #fff; background: rgba(255, 255, 255, 0.25);
            border: 1px solid rgba(255, 255, 255, 0.75); cursor: pointer;
            text-shadow: 0 1px 2px rgba(0, 25, 60, 0.85);
            transition: all 0.12s ease;
        }
        .status-pill-btn:hover { background: rgba(255, 255, 255, 0.45); }
        .status-pill-btn.active {
            background: #ffffff; color: #003366; text-shadow: none;
            box-shadow: 0 2px 8px rgba(0, 40, 90, 0.3);
        }

        .catalog-search-bar {
            display: flex; align-items: center; gap: 8px;
            background: rgba(255, 255, 255, 0.85); border: 2px solid #ffffff;
            border-radius: 16px; padding: 7px 14px; margin-bottom: 12px;
            box-shadow: inset 0 2px 5px rgba(0, 35, 80, 0.15), 0 4px 10px rgba(0, 35, 80, 0.15);
            position: relative; z-index: 2;
        }
        .catalog-search-bar input {
            width: 100%; border: none; background: transparent; outline: none;
            font-size: 13.5px; font-weight: 800; color: #002b55; user-select: text;
        }
        .catalog-search-bar input::placeholder { color: #3a6b9c; }

        .catalog-grid-list {
            display: flex; flex-direction: column; gap: 11px;
            max-height: 540px; overflow-y: auto; padding-right: 5px;
            position: relative; z-index: 2; contain: content;
        }
        .catalog-grid-list::-webkit-scrollbar { width: 8px; }
        .catalog-grid-list::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
        .catalog-grid-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.85); border-radius: 4px; }

        .media-item-card {
            display: flex; gap: 13px; padding: 11px; border-radius: 15px;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(var(--panel-r), var(--panel-g), var(--panel-b), calc(var(--panel-alpha) * 0.9)) 100%);
            border: 1.5px solid rgba(255, 255, 255, 0.92);
            box-shadow: inset 0 2px 5px rgba(255, 255, 255, 0.9), 0 4px 12px rgba(0, 45, 100, 0.25);
            transition: transform 0.14s ease, box-shadow 0.14s ease;
            position: relative;
        }
        .media-item-card:hover {
            transform: translateY(-2px);
            box-shadow: inset 0 2px 6px #fff, 0 6px 16px rgba(0, 45, 100, 0.38);
        }

        .media-poster-wrap {
            width: 86px; height: 122px; border-radius: 10px; padding: 3px;
            background: linear-gradient(180deg, #fff 0%, rgba(var(--panel-r), var(--panel-g), var(--panel-b), 0.9) 100%);
            box-shadow: 0 4px 10px rgba(0, 40, 90, 0.4); flex-shrink: 0; cursor: pointer;
            position: relative; overflow: hidden;
        }
        .media-poster-wrap img {
            width: 100%; height: 100%; border-radius: 8px; object-fit: cover;
            background: rgba(0, 40, 80, 0.3);
        }

        .media-info-col {
            flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; text-align: left;
        }
        .media-title-line {
            display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
        }
        .media-title-text {
            font-size: 16px; font-weight: 900; line-height: 1.2; cursor: pointer;
        }
        .media-title-text:hover { text-decoration: underline; }

        .media-company-line {
            font-size: 11.5px; font-weight: 800; color: #e0f7fa;
            text-shadow: 0 1px 2px rgba(0, 25, 55, 0.95);
        }
        .media-genres-line {
            display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px;
        }
        .genre-tag-pill {
            font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 8px;
            background: rgba(255, 255, 255, 0.78); color: #003366;
            border: 1px solid #ffffff;
        }
        .genre-tag-pill.adult-pill {
            background: linear-gradient(180deg, #ff8a8a, #d50000); color: #ffffff;
        }

        .media-synopsis- clamp {
            font-size: 12px; line-height: 1.35; opacity: 0.95;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
            overflow: hidden; margin-top: 2px;
        }

        .media-bottom-actions {
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
            margin-top: auto; padding-top: 6px; flex-wrap: wrap;
        }

        .user-log-score-pill {
            display: inline-flex; align-items: center; gap: 4px;
            background: rgba(0, 35, 75, 0.55); border: 1.5px solid #ffd93b;
            border-radius: 11px; padding: 2px 9px; font-size: 12.5px; font-weight: 900;
            color: #ffd93b; text-shadow: 0 1px 2px #000;
        }
        .user-log-status-pill {
            display: inline-flex; align-items: center; gap: 4px;
            background: rgba(255, 255, 255, 0.85); color: #003366;
            border-radius: 10px; padding: 2px 8px; font-size: 11px; font-weight: 900;
        }

        /* DETAY VE LOGLAMA MODALI STİLLERİ */
        .log-modal-header-card {
            display: flex; gap: 14px; text-align: left;
            background: rgba(255, 255, 255, 0.58); border: 1.5px solid #fff;
            border-radius: 16px; padding: 12px; margin-bottom: 10px;
        }
        .log-modal-poster {
            width: 95px; height: 135px; border-radius: 10px; object-fit: cover;
            border: 2px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.3); flex-shrink: 0;
        }
        .log-modal-synopsis-box {
            max-height: 95px; overflow-y: auto; font-size: 12px; color: #002b55;
            font-weight: 700; line-height: 1.4; background: rgba(255, 255, 255, 0.65);
            border: 1px solid #fff; border-radius: 10px; padding: 8px; margin-bottom: 10px;
            text-align: left; user-select: text;
        }
        .log-form-grid {
            display: grid; grid-template-columns: 1fr 1fr; gap: 8px; text-align: left;
        }
        .log-label {
            font-size: 12px; font-weight: 900; color: #003366; display: block; margin-bottom: 3px;
        }
        .log-select, .log-textarea {
            width: 100%; padding: 8px 10px; border-radius: 11px; border: 1.5px solid #fff;
            background: rgba(255, 255, 255, 0.9); color: #003366; font-size: 13px;
            font-weight: 800; outline: none; font-family: inherit;
        }
        .log-textarea {
            resize: vertical; min-height: 68px; margin-top: 4px; user-select: text;
        }
    `;
    document.head.appendChild(styleEl);

    // Loglama ve Detay Modalı
    const modalWrap = document.createElement('div');
    modalWrap.innerHTML = `
        <div id="media-log-modal" class="modal-overlay">
            <div class="modal-content" style="width: 480px; max-width: 94vw;">
                <span class="close-modal-btn" onclick="closeMediaLogModal()">×</span>
                <h2 class="aero-text" style="font-size: 20px; margin-bottom: 8px;" id="log-modal-top-title">✨ İçerik Detayı & Logla</h2>

                <div class="log-modal-header-card">
                    <img id="log-modal-poster" class="log-modal-poster" src="" alt="Poster">
                    <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:4px;">
                        <div style="font-size:16px; font-weight:900; color:#002b55;" id="log-modal-item-title">Başlık</div>
                        <div style="font-size:11.5px; font-weight:800; color:#026aa7;" id="log-modal-item-extra">Şirket / Stüdyo</div>
                        <div class="media-genres-line" id="log-modal-item-genres"></div>
                    </div>
                </div>

                <div class="log-modal-synopsis-box" id="log-modal-item-synopsis">Özet...</div>

                <div class="studio-section" style="margin-top:0;">
                    <div class="log-form-grid">
                        <div>
                            <label class="log-label">📌 Durum</label>
                            <select id="log-input-status" class="log-select">
                                <option value="completed">✅ Tamamlandı</option>
                                <option value="watching">▶️ Devam Ediyor</option>
                                <option value="plan">📅 Planlanan</option>
                                <option value="dropped">❌ Bırakıldı</option>
                            </select>
                        </div>
                        <div>
                            <label class="log-label">⭐ Puanın: <span id="log-score-val-label" style="color:#d68000;">9.0</span> / 10</label>
                            <input type="range" id="log-input-score" class="aero-slider" style="width:100%; height:10px; margin-top:8px;" min="1" max="10" step="0.5" value="9.0" oninput="document.getElementById('log-score-val-label').textContent = Number(this.value).toFixed(1)">
                        </div>
                    </div>

                    <div style="display:flex; gap:10px; align-items:center; margin-top:8px;">
                        <div style="flex:1;">
                            <label class="log-label">📊 İlerleme (Bölüm / Cilt / Saat)</label>
                            <input type="text" id="log-input-progress" class="auth-input" style="margin:0;" placeholder="Örn: 12. Bölüm, 45 Saat, Bitirdi...">
                        </div>
                        <label class="autoplay-check-label" style="margin-top:16px; background:rgba(255,255,255,0.65); padding:7px 10px; border-radius:11px; border:1px solid #fff;">
                            <input type="checkbox" id="log-input-fav">
                            <span>❤️ Favorim</span>
                        </label>
                    </div>

                    <div style="margin-top:8px;">
                        <label class="log-label">📝 İnceleme / Yorumun (İsteğe Bağlı)</label>
                        <textarea id="log-input-review" class="log-textarea" placeholder="Bu içerik hakkında ne düşünüyorsun? İncelemeni yaz..."></textarea>
                    </div>

                    <button class="aqua-btn" id="save-media-log-btn" style="width:100%; padding:10px; font-size:14px; margin-top:10px;" onclick="submitMediaLog()">💾 Listeme Kaydet ve Paylaş</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modalWrap);

    bindListModuleHooks();
})();

// 2. INDEX.HTML FONKSİYONLARINI OTOMATİK BAĞLA
function bindListModuleHooks() {
    // Üstteki "Bugün hangi animeyi izledin?" kutusuna tıklanınca doğrudan Katalog Arama sekmesini aç
    const compInput = document.getElementById('composer-Category-input');
    if (compInput) {
        compInput.readOnly = true;
        compInput.style.cursor = 'pointer';
        compInput.addEventListener('click', () => {
            activeListViewMode = 'discover';
            handleCategoryTabClick('list');
            setTimeout(() => {
                const sInput = document.getElementById('catalog-query-input');
                if (sInput) sInput.focus();
            }, 60);
        });
    }

    // Sayfa ilk açıldığında aktif kategorinin akışını yükle
    setTimeout(() => {
        if (typeof activeCatalogCategory !== 'undefined') {
            refreshActiveCategorySection();
        }
    }, 50);
}

// index.html'deki applyCategoryToUI fonksiyonunu zenginleştirir
const _origApplyCategoryToUI = typeof window.applyCategoryToUI === 'function' ? window.applyCategoryToUI : null;
window.applyCategoryToUI = function(catKey, showNotification = false) {
    const cat = (typeof CATALOG_CATEGORIES !== 'undefined' && CATALOG_CATEGORIES[catKey])
        ? CATALOG_CATEGORIES[catKey]
        : { id: 'anime', name: 'Anime', listLabel: 'Anime List', badgeText: '✨ Anime Evreni', placeholder: 'Ne düşünüyorsun?', svg: '' };

    const iconBox = document.getElementById('catalog-active-icon-box');
    if (iconBox && cat.svg) iconBox.innerHTML = cat.svg;

    const listLabel = document.getElementById('nav-list-label');
    if (listLabel) listLabel.textContent = cat.listLabel;

    const composerInput = document.getElementById('composer-Category-input');
    if (composerInput) composerInput.placeholder = `${cat.name} ara, puanla ve listene ekle... (Tıkla)`;

    const feedBadge = document.getElementById('feed-category-badge');
    if (feedBadge) feedBadge.textContent = cat.badgeText;

    if (showNotification && typeof showToast === 'function') {
        showToast(`${cat.badgeText} seçildi!`);
    }

    refreshActiveCategorySection();
};

// index.html'deki üst menü (Home / Anime List / Reviews / Community) tıklamalarını yönetir
window.handleCategoryTabClick = function(tabType) {
    activeCategorySubTab = tabType;
    if (typeof activeMainView !== 'undefined' && activeMainView !== 'home') {
        switchMainView('home');
    }

    ['nav-home-btn', 'nav-list-btn', 'nav-reviews-btn', 'nav-community-btn'].forEach(id => {
        document.getElementById(id)?.classList.remove('active');
    });

    if (tabType === 'list') document.getElementById('nav-list-btn')?.classList.add('active');
    else if (tabType === 'reviews') document.getElementById('nav-reviews-btn')?.classList.add('active');
    else if (tabType === 'community') document.getElementById('nav-community-btn')?.classList.add('active');
    else document.getElementById('nav-home-btn')?.classList.add('active');

    refreshActiveCategorySection();
};

// Home butonuna basıldığında da akışı yenile
const _origSwitchMainView = typeof window.switchMainView === 'function' ? window.switchMainView : null;
if (_origSwitchMainView) {
    window.switchMainView = function(viewName) {
        if (viewName === 'home') {
            activeCategorySubTab = 'home';
        }
        _origSwitchMainView(viewName);
    };
}

function refreshActiveCategorySection() {
    const catKey = typeof activeCatalogCategory !== 'undefined' ? activeCatalogCategory : 'anime';
    const cat = (typeof CATALOG_CATEGORIES !== 'undefined' && CATALOG_CATEGORIES[catKey]) ? CATALOG_CATEGORIES[catKey] : { name: 'Anime', listLabel: 'Anime List' };
    const feedHeading = document.getElementById('feed-section-heading');

    if (activeCategorySubTab === 'list') {
        if (feedHeading) feedHeading.textContent = `📋 ${cat.listLabel}`;
        renderListSectionShell(catKey, cat);
    } else if (activeCategorySubTab === 'reviews') {
        if (feedHeading) feedHeading.textContent = `📝 ${cat.name} İncelemeleri (Reviews)`;
        loadAndRenderCategoryFeed(catKey, true);
    } else if (activeCategorySubTab === 'community') {
        if (feedHeading) feedHeading.textContent = `💬 ${cat.name} Toplulukları & Son Etkinlikler`;
        loadAndRenderCategoryFeed(catKey, false);
    } else {
        if (feedHeading) feedHeading.textContent = `${cat.name} Feed (Akış)`;
        loadAndRenderCategoryFeed(catKey, false);
    }
}

// ============================================================================
// 3. LİSTE BÖLÜMÜ (BENİM LİSTEM + KATALOG ARAMA / KEŞFET)
// ============================================================================
function renderListSectionShell(catKey, cat) {
    const container = document.getElementById('category-feed-container');
    if (!container) return;

    container.innerHTML = `
        <div class="list-subtabs-bar">
            <div class="list-mode-switch">
                <div class="list-mode-btn ${activeListViewMode === 'my_list' ? 'active' : ''}" id="subtab-my-list" onclick="switchListSubMode('my_list')">
                    📚 Benim ${escapeHtml(cat.name)} Listem
                </div>
                <div class="list-mode-btn ${activeListViewMode === 'discover' ? 'active' : ''}" id="subtab-discover" onclick="switchListSubMode('discover')">
                    🔍 ${escapeHtml(cat.name)} Kataloğu & Ekle
                </div>
            </div>
        </div>
        <div id="list-inner-dynamic-area"></div>
    `;

    if (activeListViewMode === 'my_list') {
        renderMyListView(catKey, cat);
    } else {
        renderDiscoverCatalogView(catKey, cat);
    }
}

function switchListSubMode(mode) {
    activeListViewMode = mode;
    const catKey = typeof activeCatalogCategory !== 'undefined' ? activeCatalogCategory : 'anime';
    const cat = CATALOG_CATEGORIES[catKey] || CATALOG_CATEGORIES.anime;
    renderListSectionShell(catKey, cat);
}

function setStatusFilter(filterKey) {
    activeStatusFilter = filterKey;
    renderMyLoggedCardsDOM();
}

// A) KULLANICININ KENDİ LİSTESİ
async function renderMyListView(catKey, cat) {
    const area = document.getElementById('list-inner-dynamic-area');
    if (!area) return;

    if (!currentUser) {
        area.innerHTML = `
            <div class="feed-inner-card" style="flex-direction:column; align-items:center; text-align:center; padding:24px;">
                <p class="aero-text" style="font-size:15px; margin-bottom:10px;">Kendi ${escapeHtml(cat.name)} listeni oluşturmak ve puan vermek için giriş yapmalısın.</p>
                <div style="display:flex; gap:10px;">
                    <button class="aqua-btn" style="padding:8px 18px; font-size:13px;" onclick="openAuthModal()">🔑 Giriş Yap</button>
                    <button class="aqua-btn" style="padding:8px 18px; font-size:13px;" onclick="switchListSubMode('discover')">🌐 Kataloğa Göz At</button>
                </div>
            </div>
        `;
        return;
    }

    area.innerHTML = `
        <div class="status-filter-row" id="my-list-status-filters">
            <span class="status-pill-btn ${activeStatusFilter === 'all' ? 'active' : ''}" onclick="setStatusFilter('all')">Tümü</span>
            <span class="status-pill-btn ${activeStatusFilter === 'completed' ? 'active' : ''}" onclick="setStatusFilter('completed')">✅ Tamamlandı</span>
            <span class="status-pill-btn ${activeStatusFilter === 'watching' ? 'active' : ''}" onclick="setStatusFilter('watching')">▶️ Devam Ediyor</span>
            <span class="status-pill-btn ${activeStatusFilter === 'plan' ? 'active' : ''}" onclick="setStatusFilter('plan')">📅 Planlanan</span>
            <span class="status-pill-btn ${activeStatusFilter === 'dropped' ? 'active' : ''}" onclick="setStatusFilter('dropped')">❌ Bırakıldı</span>
            <span class="status-pill-btn ${activeStatusFilter === 'favorite' ? 'active' : ''}" onclick="setStatusFilter('favorite')">❤️ Favoriler</span>
        </div>
        <div class="catalog-grid-list" id="my-logged-items-list">
            <p class="aero-text" style="text-align:center; padding:20px; font-size:13px;">Listen yükleniyor... ⏳</p>
        </div>
    `;

    const cacheKey = `${currentUser.id}__${catKey}`;
    if (userListMemoryCache.has(cacheKey)) {
        myCategoryLogs = userListMemoryCache.get(cacheKey);
        renderMyLoggedCardsDOM();
    }

    try {
        const res = await fetch(`${API_URL}/catalog/user-list/${encodeURIComponent(currentUser.id)}?category=${encodeURIComponent(catKey)}`);
        if (!res.ok) return;
        const data = await res.json();
        myCategoryLogs = data || [];
        userListMemoryCache.set(cacheKey, myCategoryLogs);
        if (activeCategorySubTab === 'list' && activeListViewMode === 'my_list') {
            renderMyLoggedCardsDOM();
        }
    } catch (e) {}
}

function renderMyLoggedCardsDOM() {
    const listEl = document.getElementById('my-logged-items-list');
    if (!listEl) return;

    document.querySelectorAll('#my-list-status-filters .status-pill-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = Array.from(document.querySelectorAll('#my-list-status-filters .status-pill-btn')).find(b => b.getAttribute('onclick')?.includes(`'${activeStatusFilter}'`));
    if (activeBtn) activeBtn.classList.add('active');

    let filtered = myCategoryLogs;
    if (activeStatusFilter === 'favorite') {
        filtered = myCategoryLogs.filter(l => l.is_favorite);
    } else if (activeStatusFilter !== 'all') {
        filtered = myCategoryLogs.filter(l => l.status === activeStatusFilter);
    }

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="feed-inner-card" style="flex-direction:column; align-items:center; text-align:center; padding:26px;">
                <div style="font-size:34px; margin-bottom:6px;">📭</div>
                <p class="aero-text" style="font-size:14.5px;">Bu listede henüz kayıtlı içerik yok.</p>
                <button class="aqua-btn" style="margin-top:10px; padding:8px 18px; font-size:13px;" onclick="switchListSubMode('discover')">➕ Katalogdan İçerik Ara ve Ekle</button>
            </div>
        `;
        return;
    }

    listEl.innerHTML = filtered.map((log, idx) => {
        const m = log.media || {};
        const poster = m.poster_url || `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(m.title || 'Media')}`;
        const yearTxt = m.release_year ? ` (${escapeHtml(m.release_year)})` : '';
        const statusTxt = STATUS_LABELS[log.status] || '✅ Tamamlandı';

        return `
            <div class="media-item-card">
                <div class="media-poster-wrap" onclick="openLogModalFromSaved(${idx})">
                    <img src="${poster}" alt="${escapeHtml(m.title)}" loading="lazy" decoding="async">
                </div>
                <div class="media-info-col">
                    <div class="media-title-line">
                        <span class="media-title-text aero-text" onclick="openLogModalFromSaved(${idx})">
                            ${log.is_favorite ? '❤️ ' : ''}${escapeHtml(m.title)}${yearTxt}
                        </span>
                        <span class="user-log-score-pill">★ ${Number(log.score || 0).toFixed(1)}</span>
                    </div>
                    ${m.extra_info ? `<div class="media-company-line">${escapeHtml(m.extra_info)}</div>` : ''}
                    ${renderGenresPillsHtml(m.genres)}
                    ${log.review_text ? `<p class="aero-text media-synopsis-clamp" style="background:rgba(0,30,65,0.28); padding:5px 8px; border-radius:8px; margin-top:4px;">💬 "${escapeHtml(log.review_text)}"</p>` : ''}
                    <div class="media-bottom-actions">
                        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                            <span class="user-log-status-pill">${statusTxt}</span>
                            ${log.progress ? `<span class="user-log-status-pill">📊 ${escapeHtml(log.progress)}</span>` : ''}
                        </div>
                        <div style="display:flex; gap:6px;">
                            <button class="aqua-btn" style="padding:4px 10px; font-size:11.5px;" onclick="openLogModalFromSaved(${idx})">✏️ Düzenle</button>
                            <button class="aqua-btn" style="padding:4px 9px; font-size:11.5px; background:linear-gradient(180deg,#ff8a8a,#c62828);" onclick="deleteUserMediaLog(${log.id})">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// B) KATALOG ARAMA VE KEŞFET GÖRÜNÜMÜ (Ücretsiz API Verileri)
function renderDiscoverCatalogView(catKey, cat) {
    const area = document.getElementById('list-inner-dynamic-area');
    if (!area) return;

    area.innerHTML = `
        <div class="catalog-search-bar">
            <span>🔍</span>
            <input type="text" id="catalog-query-input" placeholder="${escapeHtml(cat.name)} adı ara (Şirket, stüdyo ve tüm detaylarıyla)..." oninput="onCatalogSearchInput()" onkeydown="if(event.key==='Enter') executeCatalogSearch(this.value)">
            <button class="aqua-btn" style="padding:5px 12px; font-size:12px;" onclick="executeCatalogSearch(document.getElementById('catalog-query-input').value)">Ara</button>
        </div>
        <div class="catalog-grid-list" id="catalog-discover-results">
            <p class="aero-text" style="text-align:center; padding:24px; font-size:13.5px;">🌐 Popüler ${escapeHtml(cat.name)} kataloğu çekiliyor... ⏳</p>
        </div>
    `;

    executeCatalogSearch('');
}

function onCatalogSearchInput() {
    clearTimeout(catalogSearchTimer);
    const val = document.getElementById('catalog-query-input')?.value || '';
    catalogSearchTimer = setTimeout(() => {
        executeCatalogSearch(val);
    }, 320);
}

async function executeCatalogSearch(queryText) {
    const catKey = typeof activeCatalogCategory !== 'undefined' ? activeCatalogCategory : 'anime';
    const cleanQ = (queryText || '').trim();
    const cacheKey = `${catKey}__${cleanQ.toLowerCase()}`;
    const resultsEl = document.getElementById('catalog-discover-results');
    if (!resultsEl) return;

    if (discoverMemoryCache.has(cacheKey)) {
        catalogDiscoverItems = discoverMemoryCache.get(cacheKey);
        renderDiscoverCardsDOM();
        return;
    }

    if (catalogAbortController) catalogAbortController.abort();
    catalogAbortController = new AbortController();

    resultsEl.innerHTML = `<p class="aero-text" style="text-align:center; padding:24px; font-size:13.5px;">🔍 ${cleanQ ? `"${escapeHtml(cleanQ)}" aranıyor...` : 'Katalog verileri yükleniyor...'} ⏳</p>`;

    try {
        const res = await fetch(`${API_URL}/catalog/search?category=${encodeURIComponent(catKey)}&q=${encodeURIComponent(cleanQ)}`, {
            signal: catalogAbortController.signal
        });
        if (!res.ok) throw new Error('Arama hatası');
        const data = await res.json();
        catalogDiscoverItems = data.items || [];
        if (catalogDiscoverItems.length > 0) {
            discoverMemoryCache.set(cacheKey, catalogDiscoverItems);
        }
        renderDiscoverCardsDOM();
    } catch (err) {
        if (err.name === 'AbortError') return;
        resultsEl.innerHTML = `<p class="aero-text" style="text-align:center; padding:20px; font-size:13px;">⚠️ Veriler çekilirken bağlantı hatası oluştu.</p>`;
    }
}

function renderGenresPillsHtml(genresStr) {
    if (!genresStr) return '';
    const parts = String(genresStr).split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
    if (parts.length === 0) return '';
    return `
        <div class="media-genres-line">
            ${parts.map(g => {
                const isAdult = g.includes('+18') || g.toLowerCase().includes('hentai') || g.toLowerCase().includes('ecchi') || g.includes('🔞');
                return `<span class="genre-tag-pill ${isAdult ? 'adult-pill' : ''}">${escapeHtml(g)}</span>`;
            }).join('')}
        </div>
    `;
}

function renderDiscoverCardsDOM() {
    const resultsEl = document.getElementById('catalog-discover-results');
    if (!resultsEl) return;

    if (!catalogDiscoverItems || catalogDiscoverItems.length === 0) {
        resultsEl.innerHTML = `<p class="aero-text" style="text-align:center; padding:24px; font-size:13.5px;">Aramana uygun içerik bulunamadı.</p>`;
        return;
    }

    resultsEl.innerHTML = catalogDiscoverItems.map((item, idx) => {
        const poster = item.poster_url || `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(item.title || 'Item')}`;
        const yearTxt = item.release_year ? ` (${escapeHtml(item.release_year)})` : '';

        return `
            <div class="media-item-card">
                <div class="media-poster-wrap" onclick="openMediaLogModal(${idx})">
                    <img src="${poster}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" onerror="this.src='https://api.dicebear.com/9.x/shapes/svg?seed=Fallback'">
                </div>
                <div class="media-info-col">
                    <div class="media-title-line">
                        <span class="media-title-text aero-text" onclick="openMediaLogModal(${idx})">${escapeHtml(item.title)}${yearTxt}</span>
                    </div>
                    ${item.extra_info ? `<div class="media-company-line">${escapeHtml(item.extra_info)}</div>` : ''}
                    ${renderGenresPillsHtml(item.genres)}
                    <p class="aero-text media-synopsis-clamp">${escapeHtml(item.synopsis || 'Açıklama bulunmuyor.')}</p>
                    <div class="media-bottom-actions">
                        <span class="aero-text" style="font-size:11px; opacity:0.85;">Detayları görmek için afişe veya başlığa tıkla</span>
                        <button class="aqua-btn" style="padding:5px 13px; font-size:12px;" onclick="openMediaLogModal(${idx})">➕ Listeme Ekle / Puanla</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================================
// 4. DETAY GÖRÜNTÜLEME & LOGLAMA / PUANLAMA MODALI İŞLEMLERİ
// ============================================================================
function openMediaLogModal(discoverIdx) {
    const item = catalogDiscoverItems[discoverIdx];
    if (!item) return;

    // Kullanıcının listesinde bu içerik zaten varsa mevcut puanını doldur
    const existingLog = myCategoryLogs.find(l => l.media && l.media.external_id === item.external_id);
    populateAndShowLogModal(item, existingLog || null);
}

function openLogModalFromSaved(savedIdx) {
    let filtered = myCategoryLogs;
    if (activeStatusFilter === 'favorite') filtered = myCategoryLogs.filter(l => l.is_favorite);
    else if (activeStatusFilter !== 'all') filtered = myCategoryLogs.filter(l => l.status === activeStatusFilter);

    const logObj = filtered[savedIdx];
    if (!logObj || !logObj.media) return;
    populateAndShowLogModal(logObj.media, logObj);
}

function populateAndShowLogModal(mediaItem, existingLog = null) {
    selectedMediaForLog = mediaItem;
    const poster = mediaItem.poster_url || `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(mediaItem.title || 'Media')}`;
    const yearTxt = mediaItem.release_year ? ` (${mediaItem.release_year})` : '';

    document.getElementById('log-modal-poster').src = poster;
    document.getElementById('log-modal-item-title').textContent = `${mediaItem.title}${yearTxt}`;
    document.getElementById('log-modal-item-extra').textContent = mediaItem.extra_info || '';
    document.getElementById('log-modal-item-genres').innerHTML = renderGenresPillsHtml(mediaItem.genres);
    document.getElementById('log-modal-item-synopsis').textContent = mediaItem.synopsis || 'Açıklama bulunmuyor.';

    document.getElementById('log-input-status').value = existingLog?.status || 'completed';
    const scoreVal = existingLog?.score ? Number(existingLog.score) : 9.0;
    document.getElementById('log-input-score').value = scoreVal;
    document.getElementById('log-score-val-label').textContent = scoreVal.toFixed(1);
    document.getElementById('log-input-progress').value = existingLog?.progress || '';
    document.getElementById('log-input-fav').checked = Boolean(existingLog?.is_favorite);
    document.getElementById('log-input-review').value = existingLog?.review_text || '';

    document.getElementById('media-log-modal').style.display = 'flex';
}

function closeMediaLogModal() {
    const modal = document.getElementById('media-log-modal');
    if (modal) modal.style.display = 'none';
}

async function submitMediaLog() {
    if (!currentUser) {
        showToast("⚠️ Listene kaydetmek için önce giriş yapmalısın!");
        closeMediaLogModal();
        openAuthModal();
        return;
    }
    if (!selectedMediaForLog) return;

    const btn = document.getElementById('save-media-log-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Kaydediliyor...';

    const catKey = selectedMediaForLog.category || (typeof activeCatalogCategory !== 'undefined' ? activeCatalogCategory : 'anime');

    const payload = {
        userId: currentUser.id,
        category: catKey,
        externalId: selectedMediaForLog.external_id,
        title: selectedMediaForLog.title,
        posterUrl: selectedMediaForLog.poster_url,
        releaseYear: selectedMediaForLog.release_year,
        synopsis: selectedMediaForLog.synopsis,
        genres: selectedMediaForLog.genres,
        extraInfo: selectedMediaForLog.extra_info,
        status: document.getElementById('log-input-status').value,
        score: Number(document.getElementById('log-input-score').value),
        progress: document.getElementById('log-input-progress').value.trim(),
        isFavorite: document.getElementById('log-input-fav').checked,
        reviewText: document.getElementById('log-input-review').value.trim()
    };

    try {
        const res = await fetch(`${API_URL}/catalog/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (res.ok && result.success) {
            showToast("✨ İçerik başarıyla listene kaydedildi!");
            closeMediaLogModal();
            userListMemoryCache.delete(`${currentUser.id}__${catKey}`);
            feedMemoryCache.delete(`${catKey}__false`);
            feedMemoryCache.delete(`${catKey}__true`);

            activeListViewMode = 'my_list';
            handleCategoryTabClick('list');
        } else {
            showToast("⚠️ " + (result.error || "Kaydedilemedi."));
        }
    } catch (e) {
        showToast("⚠️ Sunucu hatası.");
    } finally {
        btn.disabled = false;
        btn.textContent = '💾 Listeme Kaydet ve Paylaş';
    }
}

async function deleteUserMediaLog(logId) {
    if (!currentUser || !confirm('Bu içeriği listenden kaldırmak istediğine emin misin?')) return;
    const catKey = typeof activeCatalogCategory !== 'undefined' ? activeCatalogCategory : 'anime';

    myCategoryLogs = myCategoryLogs.filter(l => Number(l.id) !== Number(logId));
    userListMemoryCache.set(`${currentUser.id}__${catKey}`, myCategoryLogs);
    renderMyLoggedCardsDOM();
    showToast("🗑️ İçerik listenden kaldırıldı.");

    try {
        await fetch(`${API_URL}/catalog/log/${logId}?userId=${encodeURIComponent(currentUser.id)}`, {
            method: 'DELETE'
        });
    } catch (e) {}
}

// ============================================================================
// 5. KATEGORİYE GÖRE ANA AKIŞ (FEED) VE İNCELEMELER (REVIEWS)
// ============================================================================
async function loadAndRenderCategoryFeed(catKey, onlyReviews = false) {
    const container = document.getElementById('category-feed-container');
    if (!container) return;

    const cacheKey = `${catKey}__${onlyReviews}`;
    if (feedMemoryCache.has(cacheKey)) {
        renderCategoryFeedDOM(feedMemoryCache.get(cacheKey), catKey, onlyReviews);
    } else {
        container.innerHTML = `<p class="aero-text" style="text-align:center; padding:24px; font-size:13.5px;">Akış yükleniyor... ⏳</p>`;
    }

    try {
        const res = await fetch(`${API_URL}/catalog/feed?category=${encodeURIComponent(catKey)}&reviews=${onlyReviews}`);
        if (!res.ok) return;
        const data = await res.json();
        feedMemoryCache.set(cacheKey, data || []);
        if ((activeCategorySubTab === 'home' && !onlyReviews) || (activeCategorySubTab === 'reviews' && onlyReviews) || activeCategorySubTab === 'community') {
            renderCategoryFeedDOM(data || [], catKey, onlyReviews);
        }
    } catch (e) {}
}

function renderCategoryFeedDOM(logs, catKey, onlyReviews) {
    const container = document.getElementById('category-feed-container');
    if (!container) return;
    const cat = (typeof CATALOG_CATEGORIES !== 'undefined' && CATALOG_CATEGORIES[catKey]) ? CATALOG_CATEGORIES[catKey] : { name: 'Anime' };

    if (!logs || logs.length === 0) {
        container.innerHTML = `
            <div class="feed-inner-card" style="flex-direction:column; align-items:center; text-align:center; padding:28px;">
                <div style="font-size:36px; margin-bottom:8px;">🌟</div>
                <h3 class="anime-title aero-text">Henüz ${escapeHtml(cat.name)} ${onlyReviews ? 'İncelemesi' : 'Paylaşımı'} Yok</h3>
                <p class="aero-text feed-sub-desc" style="margin:6px 0 14px 0;">Bu evrende ilk log kaydını ve puanlamayı yapan sen ol!</p>
                <button class="aqua-btn" style="padding:8px 18px; font-size:13px;" onclick="activeListViewMode='discover'; handleCategoryTabClick('list');">
                    🔍 ${escapeHtml(cat.name)} Kataloğunu Aç & Puan Ver
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = `<div class="catalog-grid-list">` + logs.map(log => {
        const m = log.media || {};
        const poster = m.poster_url || `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(m.title || 'Media')}`;
        const statusTxt = STATUS_LABELS[log.status] || '✅ Tamamlandı';
        const timeStr = new Date(log.updated_at || log.created_at).toLocaleDateString('tr-TR');

        return `
            <div class="media-item-card">
                <div class="media-poster-wrap" onclick='populateAndShowLogModal(${JSON.stringify(m).replace(/'/g, "&#39;")})'>
                    <img src="${poster}" alt="${escapeHtml(m.title)}" loading="lazy" decoding="async">
                </div>
                <div class="media-info-col">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; border-bottom:1px solid rgba(255,255,255,0.35); padding-bottom:4px; margin-bottom:3px;">
                        <div style="display:flex; align-items:center; gap:7px; cursor:pointer;" onclick="if(${log.user_profile_id || 0}) window.location.href='/user/${log.user_profile_id}'">
                            <img src="${log.user_avatar_url}" style="width:24px; height:24px; border-radius:50%; border:1px solid #fff; object-fit:cover;">
                            <span class="aero-text" style="font-size:12.5px;">${escapeHtml(log.user_display_name)}</span>
                        </div>
                        <span class="aero-text" style="font-size:11px; opacity:0.85;">${timeStr}</span>
                    </div>

                    <div class="media-title-line">
                        <span class="media-title-text aero-text" onclick='populateAndShowLogModal(${JSON.stringify(m).replace(/'/g, "&#39;")})'>
                            ${log.is_favorite ? '❤️ ' : ''}${escapeHtml(m.title)} ${m.release_year ? `(${escapeHtml(m.release_year)})` : ''}
                        </span>
                        <span class="user-log-score-pill">★ ${Number(log.score || 0).toFixed(1)}</span>
                    </div>

                    ${m.extra_info ? `<div class="media-company-line">${escapeHtml(m.extra_info)}</div>` : ''}
                    ${renderGenresPillsHtml(m.genres)}

                    ${log.review_text ? `<p class="aero-text" style="font-size:12.5px; line-height:1.4; background:rgba(0,30,65,0.3); padding:7px 10px; border-radius:10px; margin-top:4px; user-select:text;">💬 "${escapeHtml(log.review_text)}"</p>` : ''}

                    <div class="media-bottom-actions">
                        <div style="display:flex; gap:6px; align-items:center;">
                            <span class="user-log-status-pill">${statusTxt}</span>
                            ${log.progress ? `<span class="user-log-status-pill">📊 ${escapeHtml(log.progress)}</span>` : ''}
                        </div>
                        <button class="aqua-btn" style="padding:4px 10px; font-size:11.5px;" onclick='populateAndShowLogModal(${JSON.stringify(m).replace(/'/g, "&#39;")})'>➕ Ben de Puanla</button>
                    </div>
                </div>
            </div>
        `;
    }).join('') + `</div>`;
}