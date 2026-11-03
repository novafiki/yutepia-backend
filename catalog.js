// ============================================================================
// YUTEPIA - GELİŞMİŞ API TABANLI FİLTRELEME VE SAYFALAMA MOTORU (catalog.js)
// ============================================================================

module.exports = function (app, supabase, fetchWithTimeout) {
  const memoryCache = new Map();
  const MEMORY_TTL_MS = 15 * 60 * 1000;
  const inFlightPromises = new Map();
  const lastProviderCallTime = new Map();

  async function safeProviderFetch(providerName, minGapMs, url, options = {}, timeoutMs = 4500) {
    const now = Date.now();
    const lastTime = lastProviderCallTime.get(providerName) || 0;
    const waitMs = Math.max(0, minGapMs - (now - lastTime));
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
    lastProviderCallTime.set(providerName, Date.now());
    return fetchWithTimeout(url, options, timeoutMs);
  }

  function cleanHtml(str) {
    return String(str || '').replace(/<\/?[^>]+(>|$)/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  }

  // 1. ANIME & MANGA MOTORU (AniList GraphQL - %100 API Tabanlı Filtreleme)
  async function fetchAnimeOrManga(category, search, sortMode, page, filters) {
    const isManga = category === 'manga';
    const mediaType = isManga ? 'MANGA' : 'ANIME';
    
    let gqlSort = 'SCORE_DESC';
    if (sortMode === 'popular') gqlSort = 'POPULARITY_DESC';
    else if (sortMode === 'newest') gqlSort = 'START_DATE_DESC';
    else if (sortMode === 'favorites') gqlSort = 'FAVOURITES_DESC';

    // Filtreleri GraphQL Sorgusuna Çevir
    let filterQuery = '';
    if (filters.genres && filters.genres.length > 0) {
      const cleanGenres = filters.genres.filter(g => g !== '+18' && g !== '18+');
      if (cleanGenres.length > 0) filterQuery += `, genre_in: ${JSON.stringify(cleanGenres)}`;
    }
    if (filters.minYear) filterQuery += `, startDate_greater: ${filters.minYear}0000`;
    if (filters.maxYear) filterQuery += `, startDate_lesser: ${filters.maxYear}1231`;
    if (filters.ageRating === '18+') filterQuery += `, isAdult: true`;
    else if (filters.ageRating !== 'all' && filters.ageRating) filterQuery += `, isAdult: false`;

    const gqlQuery = `
      query ($search: String, $page: Int) {
        Page(page: $page, perPage: 24) {
          media(search: $search, type: ${mediaType}, sort: [${gqlSort}, POPULARITY_DESC]${filterQuery}) {
            id title { english romaji } startDate { year } averageScore popularity favourites
            episodes volumes isAdult genres description(asHtml: false) coverImage { extraLarge }
            studios(isMain:true) { nodes { name } } staff(perPage:2) { edges { node { name { full } } } }
          }
        }
      }
    `;

    try {
      const variables = { page: Number(page) || 1 };
      if (search) variables.search = search;

      const res = await safeProviderFetch('anilist', 350, 'https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gqlQuery, variables })
      }, 5000);

      if (res.ok) {
        const json = await res.json();
        const mediaList = json?.data?.Page?.media || [];
        return mediaList.map(m => {
          const studioName = isManga 
            ? (m.staff?.edges || []).map(e => e.node?.name?.full).join(', ') || 'Manga Yayıncısı'
            : (m.studios?.nodes || []).map(s => s.name).join(', ') || 'Anime Stüdyosu';
          
          let age = 'PG-13';
          if (m.isAdult) age = '18+';
          else if ((m.genres || []).some(g => ['Horror', 'Psychological', 'Ecchi'].includes(g))) age = 'R-17+';

          return {
            external_id: `al_${category}_${m.id}`, category,
            title: m.title?.english || m.title?.romaji || 'İçerik',
            year: m.startDate?.year || 2020,
            score: m.averageScore ? Number((m.averageScore / 10).toFixed(2)) : 8.0,
            popularity: m.popularity || 0, favorites: m.favourites || 0,
            studio: studioName, ageRating: age,
            episodes: isManga ? `${m.volumes || '?'} Cilt` : `${m.episodes || '?'} Bölüm`,
            genres: m.genres || [],
            poster: m.coverImage?.extraLarge || '',
            synopsis: cleanHtml(m.description) || 'Açıklama bulunmuyor.'
          };
        });
      }
    } catch (e) {}
    return [];
  }

  // 2. OYUN MOTORU (GOG Catalog API - API Tabanlı Filtreleme)
  async function fetchGames(search, sortMode, page, filters) {
    try {
      let gogOrder = 'desc:score';
      if (sortMode === 'popular') gogOrder = 'desc:trending';
      else if (sortMode === 'newest') gogOrder = 'desc:releaseDate';
      else if (sortMode === 'favorites') gogOrder = 'desc:bestselling';

      let gogUrl = `https://catalog.gog.com/v1/catalog?limit=24&page=${page}&order=${gogOrder}&productType=in:game,pack`;
      if (search) gogUrl += `&query=like:${encodeURIComponent(search)}`;
      
      // GOG API Genre Filtreleme
      if (filters.genres && filters.genres.length > 0) {
        // İngilizce etiketlere çevir (Basit eşleştirme)
        const engGenres = filters.genres.map(g => g === 'Açık Dünya' ? 'open-world' : g === 'Korku' ? 'horror' : g.toLowerCase());
        gogUrl += `&genres=in:${engGenres.join(',')}`;
      }

      const res = await safeProviderFetch('gog', 300, gogUrl, { headers: { 'User-Agent': 'Mozilla' } }, 5000);
      if (res.ok) {
        const json = await res.json();
        return (json.products || []).map((p, idx) => {
          const devs = (p.developers || []).join(', ') || 'Stüdyo';
          const genres = [...(p.genres || []), ...(p.tags || [])].map(g => g.name).slice(0, 5);
          const isMature = genres.some(g => /mature|adult|gore|horror|sexual/i.test(g));
          
          let age = isMature ? '18+' : 'R-17+';
          if (filters.ageRating === '18+' && !isMature) return null; // Ekstra Backend Filtresi
          
          const year = p.releaseDate ? Number(String(p.releaseDate).slice(0, 4)) : 2020;
          if (filters.minYear && year < filters.minYear) return null;
          if (filters.maxYear && year > filters.maxYear) return null;

          return {
            external_id: `gog_${p.id}`, category: 'oyun',
            title: p.title || 'Oyun', year,
            score: p.reviewsRating ? Number((5.5 + (p.reviewsRating / 50) * 4.2).toFixed(2)) : 8.5,
            popularity: 150000 - idx * 2000, favorites: 50000 - idx * 1000,
            studio: devs, ageRating: age,
            episodes: (p.operatingSystems || ['PC']).join(', ').toUpperCase(),
            genres, poster: p.coverVertical || '',
            synopsis: `${p.title}, ${devs} tarafından geliştirilen bir oyundur.`
          };
        }).filter(Boolean);
      }
    } catch (e) {}
    return [];
  }

  // ANA YÖNLENDİRİCİ FONKSİYON
  async function getCatalogItems(category, search, sortMode, page, filters) {
    const cacheKey = `${category}|${search.toLowerCase()}|${sortMode}|${page}|${JSON.stringify(filters)}`;
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() < cached.expires) return cached.items;
    if (inFlightPromises.has(cacheKey)) return inFlightPromises.get(cacheKey);

    const fetchPromise = (async () => {
      try {
        let fetched = [];
        if (category === 'anime' || category === 'manga') fetched = await fetchAnimeOrManga(category, search, sortMode, page, filters);
        else if (category === 'oyun') fetched = await fetchGames(search, sortMode, page, filters);
        // Not: Film ve Dizi API'leri karmaşıklık yaratmaması adına şimdilik atlandı, aynı mantıkla eklenebilir.

        if (fetched.length > 0) {
          memoryCache.set(cacheKey, { items: fetched, expires: Date.now() + MEMORY_TTL_MS });
        }
        return fetched;
      } finally {
        inFlightPromises.delete(cacheKey);
      }
    })();

    inFlightPromises.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  app.get('/catalog/query', async (req, res) => {
    const category = (req.query.category || 'anime').trim().toLowerCase();
    const q = (req.query.q || '').trim();
    const sort = (req.query.sort || 'best').trim().toLowerCase();
    const page = Number(req.query.page) || 1;
    
    // Gelişmiş Filtre Parametreleri
    const filters = {
        genres: req.query.genres ? req.query.genres.split(',') : [],
        minYear: Number(req.query.minYear) || null,
        maxYear: Number(req.query.maxYear) || null,
        ageRating: req.query.ageRating || 'all'
    };

    try {
      const items = await getCatalogItems(category, q, sort, page, filters);
      res.json({ items: items || [], page, hasMore: items.length >= 20 });
    } catch (err) {
      res.json({ items: [], page, hasMore: false });
    }
  });
};