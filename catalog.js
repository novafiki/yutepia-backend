// ============================================================================
// YUTEPIA - 7 EVRENLİ SUNUCU TARAFLI SIRALAMA, FİLTRELEME VE SAYFALAMA MOTORU (catalog.js)
// ============================================================================

module.exports = function (app, supabase, fetchWithTimeout) {
  const memoryCache = new Map();
  const MEMORY_TTL_MS = 20 * 60 * 1000;
  const inFlightPromises = new Map();
  const lastProviderCallTime = new Map();

  async function safeProviderFetch(providerName, minGapMs, url, options = {}, timeoutMs = 4800) {
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

  const API_TO_TR_GENRE = {
    'Action': 'Aksiyon', 'Adventure': 'Macera', 'Fantasy': 'Fantezi', 'Drama': 'Dram',
    'Comedy': 'Komedi', 'Sci-Fi': 'Bilim Kurgu', 'Science-Fiction': 'Bilim Kurgu',
    'Romance': 'Romantik', 'Mystery': 'Gizem', 'Psychological': 'Psikolojik',
    'Supernatural': 'Doğaüstü', 'Thriller': 'Gerilim', 'Horror': 'Korku',
    'Sports': 'Spor', 'Ecchi': 'Ecchi', 'Hentai': '+18', 'Crime': 'Suç',
    'Family': 'Aile', 'History': 'Tarih', 'Animation': 'Animasyon',
    'Role-playing (RPG)': 'RPG', 'Shooter': 'FPS', 'Strategy': 'Strateji',
    'Simulation': 'Simülasyon', 'Indie': 'Bağımsız', 'Open World': 'Açık Dünya'
  };

  const GOG_GENRE_SLUGS = {
    'RPG': 'rpg', 'Action': 'action', 'Aksiyon': 'action', 'Open World': 'open-world',
    'Açık Dünya': 'open-world', 'Adventure': 'adventure', 'Macera': 'adventure',
    'Shooter': 'shooter', 'FPS': 'shooter', 'Horror': 'horror', 'Korku': 'horror',
    'Strategy': 'strategy', 'Strateji': 'strategy', 'Simulation': 'simulation',
    'Simülasyon': 'simulation', 'Indie': 'indie', 'Survival': 'survival',
    'Sci-Fi': 'sci-fi', 'Fantasy': 'fantasy'
  };

  function toTrGenres(arr, isAdult = false) {
    const s = new Set();
    (arr || []).forEach(g => { if (g) s.add(API_TO_TR_GENRE[g] || g); });
    if (isAdult) s.add('+18');
    return Array.from(s);
  }

  // 1. ANIME & 2. MANGA (AniList GraphQL)
  async function fetchAnimeOrManga(category, search, sortMode, page, filters) {
    const isManga = category === 'manga';
    const mediaType = isManga ? 'MANGA' : 'ANIME';
    let gqlSort = 'SCORE_DESC';
    if (sortMode === 'popular') gqlSort = 'POPULARITY_DESC';
    else if (sortMode === 'newest') gqlSort = 'START_DATE_DESC';
    else if (sortMode === 'favorites') gqlSort = 'FAVOURITES_DESC';

    let filterQuery = '';
    if (filters.genres && filters.genres.length > 0) {
      const cleanGenres = filters.genres.filter(g => g && g !== '+18' && g !== '18+');
      if (cleanGenres.length > 0) filterQuery += `, genre_in: ${JSON.stringify(cleanGenres)}`;
    }
    if (filters.minYear) filterQuery += `, startDate_greater: ${filters.minYear}0000`;
    if (filters.maxYear) filterQuery += `, startDate_lesser: ${filters.maxYear}1231`;
    if (filters.ageRating === '18+' || (filters.genres || []).includes('+18')) filterQuery += `, isAdult: true`;
    else if (filters.ageRating === 'G' || filters.ageRating === 'PG-13') filterQuery += `, isAdult: false`;

    const gqlQuery = `
      query ($search: String, $page: Int) {
        Page(page: $page, perPage: 25) {
          pageInfo { hasNextPage }
          media(search: $search, type: ${mediaType}, sort: [${gqlSort}, POPULARITY_DESC]${filterQuery}) {
            id title { english romaji native } startDate { year } averageScore popularity favourites
            episodes volumes isAdult genres description(asHtml: false) coverImage { extraLarge large }
            studios(isMain: true) { nodes { name } } staff(perPage: 2) { edges { node { name { full } } } }
          }
        }
      }
    `;

    try {
      const variables = { page: Number(page) || 1 };
      if (search) variables.search = search;
      const res = await safeProviderFetch('anilist', 300, 'https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gqlQuery, variables })
      }, 4800);

      if (res.ok) {
        const json = await res.json();
        const mediaList = json?.data?.Page?.media || [];
        return mediaList.map(m => {
          const studioName = isManga
            ? (m.staff?.edges || []).map(e => e.node?.name?.full).filter(Boolean).join(', ') || 'Manga Yayıncısı'
            : (m.studios?.nodes || []).map(s => s.name).join(', ') || 'Anime Stüdyosu';
          let age = 'PG-13';
          if (m.isAdult) age = '18+';
          else if ((m.genres || []).some(g => ['Horror', 'Psychological', 'Thriller', 'Ecchi'].includes(g))) age = 'R-17+';

          return {
            external_id: `al_${category}_${m.id}`, category,
            title: m.title?.english || m.title?.romaji || m.title?.native || 'İçerik',
            year: m.startDate?.year || 2020,
            score: m.averageScore ? Number((m.averageScore / 10).toFixed(2)) : 8.1,
            popularity: m.popularity || 15000, favorites: m.favourites || 3000,
            studio: studioName, ageRating: age,
            episodes: isManga ? `${m.volumes || '?'} Cilt` : `${m.episodes || '?'} Bölüm`,
            genres: toTrGenres(m.genres, m.isAdult),
            poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
            synopsis: cleanHtml(m.description) || 'Açıklama bulunmuyor.'
          };
        }).filter(it => !filters.studio || it.studio.toLowerCase().includes(filters.studio.toLowerCase()));
      }
    } catch (e) {}
    return [];
  }

  // 3. OYUN MOTORU (GOG Catalog v1 API - Sayfalamalı, Tür & Yıl Filtreli)
  async function fetchGames(search, sortMode, page, filters) {
    try {
      let gogOrder = 'desc:score';
      if (sortMode === 'popular') gogOrder = 'desc:trending';
      else if (sortMode === 'newest') gogOrder = 'desc:releaseDate';
      else if (sortMode === 'favorites') gogOrder = 'desc:bestselling';

      let gogUrl = `https://catalog.gog.com/v1/catalog?limit=28&page=${page}&order=${gogOrder}&productType=in:game,pack`;
      if (search) gogUrl += `&query=like:${encodeURIComponent(search)}`;

      if (filters.genres && filters.genres.length > 0) {
        const slugs = filters.genres.map(g => GOG_GENRE_SLUGS[g] || g.toLowerCase().replace(/\s+/g, '-'));
        gogUrl += `&genres=in:${slugs.join(',')}`;
      }

      const res = await safeProviderFetch('gog', 300, gogUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 4800);
      if (res.ok) {
        const json = await res.json();
        return (json.products || []).map((p, idx) => {
          const devs = (p.developers || []).join(', ') || 'Oyun Stüdyosu';
          const pubs = (p.publishers || []).join(', ');
          const studioStr = pubs && pubs !== devs ? `${devs} • ${pubs}` : devs;
          if (filters.studio && !studioStr.toLowerCase().includes(filters.studio.toLowerCase())) return null;

          const rawGenres = [...(p.genres || []), ...(p.tags || [])].map(g => g.name).filter(Boolean);
          const isMature = rawGenres.some(g => /mature|adult|gore|horror|sexual|nudity|witcher|cyberpunk|gta/i.test(g)) || (p.ageRating && Number(p.ageRating) >= 18);
          const age = isMature ? '18+' : 'R-17+';

          const year = p.releaseDate ? Number(String(p.releaseDate).slice(0, 4)) : 2020;
          if (filters.minYear && year < filters.minYear) return null;
          if (filters.maxYear && year > filters.maxYear) return null;

          const globalIdx = (page - 1) * 28 + idx;
          const calcScore = p.reviewsRating ? Number((5.8 + (p.reviewsRating / 50) * 4.0).toFixed(2)) : Number(Math.max(7.2, 9.5 - globalIdx * 0.03).toFixed(2));

          return {
            external_id: `gog_${p.id}`, category: 'oyun',
            title: p.title || 'Oyun', year,
            score: calcScore,
            popularity: Math.max(10000, 220000 - globalIdx * 2400),
            favorites: Math.max(3000, 80000 - globalIdx * 950),
            studio: studioStr, ageRating: age,
            episodes: (p.operatingSystems || ['PC']).join(', ').toUpperCase(),
            genres: toTrGenres(rawGenres.slice(0, 6)),
            poster: p.coverVertical || p.coverHorizontal || '',
            synopsis: `${p.title}, ${studioStr} tarafından geliştirilen ve yayınlanan bir oyundur.`
          };
        }).filter(Boolean);
      }
    } catch (e) {}
    return [];
  }

  // 4. FİLM MOTORU (YTS Movies API + iTunes Movie API - Sayfalamalı)
  async function fetchMovies(search, sortMode, page, filters) {
    try {
      let ytsSort = 'rating';
      if (sortMode === 'popular') ytsSort = 'download_count';
      else if (sortMode === 'newest') ytsSort = 'year';
      else if (sortMode === 'favorites') ytsSort = 'like_count';

      let ytsUrl = `https://yts.mx/api/v2/list_movies.json?limit=25&page=${page}&sort_by=${ytsSort}`;
      if (search) ytsUrl += `&query_term=${encodeURIComponent(search)}`;
      if (filters.genres && filters.genres.length > 0) {
        ytsUrl += `&genre=${encodeURIComponent(filters.genres[0])}`;
      }

      const res = await safeProviderFetch('yts', 300, ytsUrl, {}, 4500);
      if (res.ok) {
        const json = await res.json();
        const movies = json?.data?.movies || [];
        if (movies.length > 0) {
          return movies.map((m, idx) => {
            const globalIdx = (page - 1) * 25 + idx;
            let age = 'PG-13';
            if (m.mpa_rating === 'R') age = 'R-17+';
            else if (m.mpa_rating === 'NC-17') age = '18+';
            else if (m.mpa_rating === 'G') age = 'G';

            return {
              external_id: `yts_${m.id}`, category: 'film',
              title: m.title_english || m.title || 'Film',
              year: m.year || 2020,
              score: m.rating || 8.0,
              popularity: Math.max(10000, 200000 - globalIdx * 2200),
              favorites: (m.like_count || 10000) + 5000,
              studio: 'Sinema Stüdyosu', ageRating: age,
              episodes: m.runtime ? `${m.runtime} dk` : '120 dk',
              genres: toTrGenres(m.genres || []),
              poster: m.large_cover_image || m.medium_cover_image || '',
              synopsis: cleanHtml(m.description_full || m.synopsis) || 'Açıklama bulunmuyor.'
            };
          });
        }
      }
    } catch (e) {}
    return [];
  }

  // 5. DİZİ & 6. ÇİZGİ DİZİ MOTORU (TVMaze API - Sayfalamalı)
  async function fetchSeries(category, search, sortMode, page, filters) {
    const isCartoon = category === 'cizgi_dizi';
    try {
      const url = search
        ? `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(search)}`
        : `https://api.tvmaze.com/shows?page=${Math.max(0, page - 1)}`;
      const res = await safeProviderFetch('tvmaze', 250, url, {}, 4500);
      if (!res.ok) return [];
      const raw = await res.json();
      const shows = search ? (raw || []).map(d => d.show).filter(Boolean) : (raw || []);

      let list = shows.filter(s => {
        const isAnim = (s.genres || []).includes('Animation') || s.type === 'Animation';
        const isJp = s.language === 'Japanese' && (s.genres || []).includes('Anime');
        if (isJp) return false;
        return isCartoon ? isAnim : !isAnim;
      }).map(s => {
        const studio = s.network?.name || s.webChannel?.name || 'TV / Dijital Platform';
        const genres = toTrGenres(s.genres || []);
        const year = s.premiered ? Number(s.premiered.slice(0, 4)) : 2018;
        const weight = s.weight || 75;
        return {
          external_id: `tvm_${s.id}`, category,
          title: s.name || 'Dizi', year,
          score: s.rating?.average || 8.0,
          popularity: weight * 2100, favorites: weight * 680,
          studio,
          ageRating: (s.genres || []).some(g => ['Crime', 'Horror'].includes(g)) ? 'R-17+' : (isCartoon ? 'G' : 'PG-13'),
          episodes: `${s.averageRuntime || s.runtime || 45} dk`,
          genres,
          poster: s.image?.original || s.image?.medium || '',
          synopsis: cleanHtml(s.summary) || 'Açıklama bulunmuyor.'
        };
      });

      list.sort((a, b) => {
        if (sortMode === 'best') return (b.score || 0) - (a.score || 0);
        if (sortMode === 'popular') return (b.popularity || 0) - (a.popularity || 0);
        if (sortMode === 'newest') return (b.year || 0) - (a.year || 0);
        if (sortMode === 'favorites') return (b.favorites || 0) - (a.favorites || 0);
        return 0;
      });

      return list.slice(0, 30);
    } catch (e) { return []; }
  }

  // 7. ÇİZGİ ROMAN MOTORU (Google Books API - Sayfalamalı)
  async function fetchComics(search, sortMode, page) {
    try {
      const startIndex = (Math.max(1, page) - 1) * 25;
      const q = search ? `${search} comic` : 'subject:comics+graphic+novels';
      const orderBy = sortMode === 'newest' ? 'newest' : 'relevance';
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&startIndex=${startIndex}&maxResults=25&orderBy=${orderBy}`;
      const res = await safeProviderFetch('gbooks', 300, url, {}, 4500);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items || []).map((item, idx) => {
        const info = item.volumeInfo || {};
        const pub = info.publisher || 'Marvel / DC / Image';
        const auth = (info.authors || []).slice(0, 2).join(', ');
        const rawImg = info.imageLinks?.large || info.imageLinks?.thumbnail || '';
        const globalIdx = startIndex + idx;
        return {
          external_id: `gb_${item.id}`, category: 'cizgi_roman',
          title: info.title || 'Çizgi Roman',
          year: info.publishedDate ? Number(info.publishedDate.slice(0, 4)) || 2015 : 2015,
          score: info.averageRating ? Number((info.averageRating * 1.95).toFixed(2)) : Number(Math.max(7.4, 9.4 - globalIdx * 0.04).toFixed(2)),
          popularity: Math.max(10000, 160000 - globalIdx * 2100),
          favorites: Math.max(3000, 55000 - globalIdx * 900),
          studio: auth ? `${pub} • ${auth}` : pub,
          ageRating: info.maturityRating === 'MATURE' ? '18+' : 'PG-13',
          episodes: info.pageCount ? `${info.pageCount} Sayfa` : 'Özel Cilt',
          genres: ['Süper Kahraman', 'Aksiyon', 'Çizgi Roman'],
          poster: rawImg.replace(/^http:\/\//i, 'https://'),
          synopsis: cleanHtml(info.description) || 'Açıklama bulunmuyor.'
        };
      });
    } catch (e) { return []; }
  }

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
        else if (category === 'film') fetched = await fetchMovies(search, sortMode, page, filters);
        else if (category === 'dizi' || category === 'cizgi_dizi') fetched = await fetchSeries(category, search, sortMode, page, filters);
        else if (category === 'cizgi_roman') fetched = await fetchComics(search, sortMode, page);

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
    const studio = (req.query.studio || '').trim();
    const sort = (req.query.sort || 'best').trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page) || 1);

    const filters = {
      studio,
      genres: req.query.genres ? req.query.genres.split(',').filter(Boolean) : [],
      minYear: Number(req.query.minYear) || null,
      maxYear: Number(req.query.maxYear) || null,
      ageRating: req.query.ageRating || 'all'
    };

    try {
      const combinedSearch = [q, studio].filter(Boolean).join(' ');
      const items = await getCatalogItems(category, combinedSearch, sort, page, filters);
      res.json({ items: items || [], page, hasMore: (items || []).length >= 15 });
    } catch (err) {
      res.json({ items: [], page, hasMore: false });
    }
  });
};