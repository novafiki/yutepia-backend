 ============================================================================
 YUTEPIA - 7 EVRENLİ (ANIME, MANGA, OYUN, FİLM, DİZİ, ÇİZGİ DİZİ, ÇİZGİ ROMAN)
 DETAYLI VERİ ÇEKME, LOGLAMA, PUANLAMA VE İNCELEME MODÜLÜ (catalog.js)
 (+18 Kısıtlaması Yoktur - Yapımcı Şirket  Stüdyo  Tür Detayları Dahildir)
 ============================================================================

module.exports = function (app) {
  const { supabase, fetchWithTimeout } = app.locals;

   Hızlı yanıt için RAM Önbelleği (10 dakika)
  const catalogSearchCache = new Map();
  const CACHE_TTL_MS = 10  60  1000;

  function stripHtmlTags(str) {
    if (!str) return '';
    return String(str)
      .replace(brsgi, 'n')
      .replace([^]+($)g, '')
      .replace(&quot;g, '')
      .replace(&#39;g, ')
      .replace(&amp;g, '&')
      .replace(n{3,}g, 'nn')
      .trim();
  }

   ==========================================================================
   1. ANIME VERİ ÇEKİCİ (AniList GraphQL + Jikan v4 MyAnimeList - +18 Açık)
   ==========================================================================
  async function searchAnime(query) {
    const gqlQuery = `
      query ($search String) {
        Page(page 1, perPage 24) {
          media(search $search, type ANIME, sort [POPULARITY_DESC, SCORE_DESC]) {
            id
            title { romaji english native }
            coverImage { extraLarge large }
            startDate { year }
            description(asHtml false)
            genres
            isAdult
            episodes
            format
            averageScore
            studios {
              nodes { name isAnimationStudio }
            }
          }
        }
      }
    `;

    try {
      const variables = query  { search query }  {};
      const res = await fetchWithTimeout('httpsgraphql.anilist.co', {
        method 'POST',
        headers { 'Content-Type' 'applicationjson', 'Accept' 'applicationjson' },
        body JSON.stringify({ query gqlQuery, variables })
      }, 4500);

      if (res.ok) {
        const json = await res.json();
        const list = json.data.Page.media  [];
        if (list.length  0) {
          return list.map(item = {
            const allStudios = (item.studios.nodes  []).map(s = s.name);
            const mainStudios = (item.studios.nodes  []).filter(s = s.isAnimationStudio).map(s = s.name);
            const studioText = (mainStudios.length  0  mainStudios  allStudios).slice(0, 3).join(', ')  'Bilinmiyor';
            const genresList = [...(item.genres  [])];
            if (item.isAdult && !genresList.includes('🔞 +18 (Yetişkin)')) {
              genresList.unshift('🔞 +18 (Yetişkin)');
            }

            const epText = item.episodes  `${item.episodes} Bölüm`  'Devam Ediyor';
            const scoreText = item.averageScore  ` • ⭐ ${(item.averageScore  10).toFixed(1)}`  '';

            return {
              external_id `anilist_anime_${item.id}`,
              category 'anime',
              title item.title.english  item.title.romaji  item.title.native  'Anime',
              poster_url item.coverImage.extraLarge  item.coverImage.large  '',
              release_year item.startDate.year  String(item.startDate.year)  '',
              synopsis stripHtmlTags(item.description)  'Açıklama bulunmuyor.',
              genres genresList.join(', '),
              extra_info `🏢 Stüdyo ${studioText} • 📺 ${item.format  'TV'} (${epText})${scoreText}`
            };
          });
        }
      }
    } catch (e) {}

     YEDEK Jikan v4 (MyAnimeList) - sfw parametresi YOK (+18 dahil)
    try {
      const jikanUrl = query
         `httpsapi.jikan.moev4animeq=${encodeURIComponent(query)}&limit=24&order_by=members&sort=desc`
         `httpsapi.jikan.moev4topanimelimit=24`;
      const jRes = await fetchWithTimeout(jikanUrl, {}, 4500);
      if (jRes.ok) {
        const jData = await jRes.json();
        return (jData.data  []).map(item = {
          const studios = [...(item.studios  []), ...(item.producers  [])].map(s = s.name).slice(0, 3).join(', ')  'Bilinmiyor';
          const genres = [...(item.genres  []), ...(item.explicit_genres  []), ...(item.themes  [])].map(g = g.name);
          if (item.rating && item.rating.includes('Rx')) genres.unshift('🔞 +18 (Hentai)');
          return {
            external_id `mal_anime_${item.mal_id}`,
            category 'anime',
            title item.title_english  item.title  'Anime',
            poster_url item.images.jpg.large_image_url  item.images.jpg.image_url  '',
            release_year item.year  String(item.year)  (item.aired.prop.from.year  String(item.aired.prop.from.year)  ''),
            synopsis item.synopsis  'Açıklama bulunmuyor.',
            genres genres.join(', '),
            extra_info `🏢 Stüdyo ${studios} • 📺 ${item.type  'TV'} (${item.episodes  ''} Bölüm)`
          };
        });
      }
    } catch (e) {}

    return [];
  }

   ==========================================================================
   2. MANGA VERİ ÇEKİCİ (AniList GraphQL + Jikan v4 Manga - +18 Açık)
   ==========================================================================
  async function searchManga(query) {
    const gqlQuery = `
      query ($search String) {
        Page(page 1, perPage 24) {
          media(search $search, type MANGA, sort [POPULARITY_DESC, SCORE_DESC]) {
            id
            title { romaji english native }
            coverImage { extraLarge large }
            startDate { year }
            description(asHtml false)
            genres
            isAdult
            chapters
            volumes
            averageScore
            staff(perPage 4) {
              edges {
                role
                node { name { full } }
              }
            }
          }
        }
      }
    `;

    try {
      const variables = query  { search query }  {};
      const res = await fetchWithTimeout('httpsgraphql.anilist.co', {
        method 'POST',
        headers { 'Content-Type' 'applicationjson', 'Accept' 'applicationjson' },
        body JSON.stringify({ query gqlQuery, variables })
      }, 4500);

      if (res.ok) {
        const json = await res.json();
        const list = json.data.Page.media  [];
        if (list.length  0) {
          return list.map(item = {
            const authors = (item.staff.edges  []).map(e = e.node.name.full).filter(Boolean).slice(0, 2).join(', ')  'Bilinmiyor';
            const genresList = [...(item.genres  [])];
            if (item.isAdult && !genresList.includes('🔞 +18 (Yetişkin)')) {
              genresList.unshift('🔞 +18 (Yetişkin)');
            }
            const chapText = item.chapters  `${item.chapters} Bölüm`  'Devam Ediyor';
            const volText = item.volumes  `  ${item.volumes} Cilt`  '';

            return {
              external_id `anilist_manga_${item.id}`,
              category 'manga',
              title item.title.english  item.title.romaji  item.title.native  'Manga',
              poster_url item.coverImage.extraLarge  item.coverImage.large  '',
              release_year item.startDate.year  String(item.startDate.year)  '',
              synopsis stripHtmlTags(item.description)  'Açıklama bulunmuyor.',
              genres genresList.join(', '),
              extra_info `✍️ YazarÇizer ${authors} • 📖 ${chapText}${volText}`
            };
          });
        }
      }
    } catch (e) {}

     YEDEK Jikan v4 Manga
    try {
      const jikanUrl = query
         `httpsapi.jikan.moev4mangaq=${encodeURIComponent(query)}&limit=24&order_by=members&sort=desc`
         `httpsapi.jikan.moev4topmangalimit=24`;
      const jRes = await fetchWithTimeout(jikanUrl, {}, 4500);
      if (jRes.ok) {
        const jData = await jRes.json();
        return (jData.data  []).map(item = {
          const authors = (item.authors  []).map(a = a.name).slice(0, 2).join(', ')  'Bilinmiyor';
          const magazine = (item.serializations  []).map(s = s.name).join(', ');
          const genres = [...(item.genres  []), ...(item.explicit_genres  []), ...(item.themes  [])].map(g = g.name);
          return {
            external_id `mal_manga_${item.mal_id}`,
            category 'manga',
            title item.title_english  item.title  'Manga',
            poster_url item.images.jpg.large_image_url  item.images.jpg.image_url  '',
            release_year item.published.prop.from.year  String(item.published.prop.from.year)  '',
            synopsis item.synopsis  'Açıklama bulunmuyor.',
            genres genres.join(', '),
            extra_info `✍️ Yazar ${authors}${magazine  ` • 🏢 Dergi ${magazine}`  ''} • 📖 ${item.chapters  ''} Bölüm`
          };
        });
      }
    } catch (e) {}

    return [];
  }

   ==========================================================================
   3. OYUN VERİ ÇEKİCİ (GOG Catalog API + Steam Store API - GeliştiriciYayıncı Dahil)
   ==========================================================================
  async function searchGames(query) {
    const results = [];

     KAYNAK 1 GOG Catalog v1 API (Geliştirici şirket, Yayıncı şirket, Türler ve +18 Oyunları doğrudan verir)
    try {
      const gogUrl = query
         `httpscatalog.gog.comv1cataloglimit=20&query=like${encodeURIComponent(query)}&order=descscore&productType=ingame,pack`
         `httpscatalog.gog.comv1cataloglimit=20&order=desctrending&productType=ingame`;

      const gRes = await fetchWithTimeout(gogUrl, {
        headers { 'User-Agent' 'Mozilla5.0 (Windows NT 10.0; Win64; x64)' }
      }, 4000);

      if (gRes.ok) {
        const gData = await gRes.json();
        (gData.products  []).forEach(p = {
          const devs = (p.developers  []).join(', ')  'Bilinmiyor';
          const pubs = (p.publishers  []).join(', ')  devs;
          const genres = [...(p.genres  []), ...(p.tags  [])].map(g = g.name).filter(Boolean).slice(0, 6);
          const osList = (p.operatingSystems  []).join(', ').toUpperCase();

          results.push({
            external_id `gog_game_${p.id}`,
            category 'oyun',
            title p.title  'Oyun',
            poster_url p.coverVertical  p.coverHorizontal  '',
            release_year p.releaseDate  String(p.releaseDate).slice(0, 4)  '',
            synopsis `${p.title}, ${devs} tarafından geliştirilen ve ${pubs} tarafından yayınlanan ${genres.slice(0, 3).join('')} türünde bir oyundur.`,
            genres genres.join(', '),
            extra_info `🏢 Geliştirici ${devs} • 🏢 Yayıncı ${pubs}${osList  ` • 💻 ${osList}`  ''}`
          });
        });
      }
    } catch (e) {}

     KAYNAK 2 Steam Store API (Eğer arama yapıldıysa veya GOG az sonuç döndüyse Steam'den tamamla)
    if (results.length  12) {
      try {
        const term = query  'Elden Ring';
        const steamUrl = `httpsstore.steampowered.comapistoresearchterm=${encodeURIComponent(term)}&l=turkish&cc=TR`;
        const sRes = await fetchWithTimeout(steamUrl, {}, 3500);
        if (sRes.ok) {
          const sData = await sRes.json();
          const items = (sData.items  []).slice(0, 12);

           İlk 5 oyunun detaylı şirket ve tür bilgisini paralel çek
          const detailMap = {};
          await Promise.allSettled(
            items.slice(0, 5).map(async (it) = {
              const dRes = await fetchWithTimeout(`httpsstore.steampowered.comapiappdetailsappids=${it.id}&l=turkish`, {}, 2500);
              if (dRes.ok) {
                const dJson = await dRes.json();
                if (dJson[it.id].success) {
                  detailMap[it.id] = dJson[it.id].data;
                }
              }
            })
          );

          items.forEach(it = {
            if (results.some(r = r.title.toLowerCase() === (it.name  '').toLowerCase())) return;
            const det = detailMap[it.id];
            const devs = det.developers  det.developers.join(', ')  'Steam Oyun Stüdyosu';
            const pubs = det.publishers  det.publishers.join(', ')  '';
            const genres = det.genres  det.genres.map(g = g.description).join(', ')  'Aksiyon  Oyun';
            const year = det.release_date.date  det.release_date.date.slice(-4)  '';
            const desc = det.short_description  stripHtmlTags(det.short_description)  `${it.name} Steam mağaza oyunu.`;

            results.push({
              external_id `steam_game_${it.id}`,
              category 'oyun',
              title it.name,
              poster_url `httpsshared.akamai.steamstatic.comstore_item_assetssteamapps${it.id}library_600x900.jpg`,
              release_year year,
              synopsis desc,
              genres genres,
              extra_info `🏢 Geliştirici ${devs}${pubs  ` • 🏢 Yayıncı ${pubs}`  ''} • 🎮 Steam`
            });
          });
        }
      } catch (e) {}
    }

    return results.slice(0, 24);
  }

   ==========================================================================
   4. FİLM VERİ ÇEKİCİ (Apple iTunes Movie API + YTS Movie API - +18R Açık)
   ==========================================================================
  async function searchMovies(query) {
    const results = [];

     KAYNAK 1 YTS Movies API (Türler, IMDb puanı, Süre, Yıl ve Özet)
    try {
      const ytsUrl = query
         `httpsyts.mxapiv2list_movies.jsonquery_term=${encodeURIComponent(query)}&limit=20&sort_by=download_count`
         `httpsyts.mxapiv2list_movies.jsonlimit=20&sort_by=download_count`;
      const yRes = await fetchWithTimeout(ytsUrl, {}, 3800);
      if (yRes.ok) {
        const yJson = await yRes.json();
        const movies = yJson.data.movies  [];
        movies.forEach(m = {
          const genres = (m.genres  []).join(', ');
          const runtime = m.runtime  `${m.runtime} dk`  '';
          const rating = m.rating  `⭐ ${m.rating}10`  '';
          const mpa = m.mpa_rating  `🔞 ${m.mpa_rating}`  '';
          const infoParts = [rating, runtime, mpa].filter(Boolean).join(' • ');

          results.push({
            external_id `yts_movie_${m.id}`,
            category 'film',
            title m.title_english  m.title  'Film',
            poster_url m.large_cover_image  m.medium_cover_image  '',
            release_year m.year  String(m.year)  '',
            synopsis m.description_full  m.synopsis  m.summary  'Film açıklaması bulunmuyor.',
            genres genres,
            extra_info `🎬 Sinema Filmi${infoParts  ` • ${infoParts}`  ''}`
          });
        });
      }
    } catch (e) {}

     KAYNAK 2 Apple iTunes Movie API (Yönetmen  Stüdyo adı ve HD Poster)
    try {
      const searchTerm = query  'Christopher Nolan';
      const itunesUrl = `httpsitunes.apple.comsearchmedia=movie&entity=movie&limit=20&term=${encodeURIComponent(searchTerm)}`;
      const iRes = await fetchWithTimeout(itunesUrl, {}, 3800);
      if (iRes.ok) {
        const iJson = await iRes.json();
        (iJson.results  []).forEach(item = {
          if (results.some(r = r.title.toLowerCase() === (item.trackName  '').toLowerCase())) return;
          const hiResPoster = (item.artworkUrl100  '').replace('100x100bb', '600x900bb');
          const year = item.releaseDate  item.releaseDate.slice(0, 4)  '';
          const timeMin = item.trackTimeMillis  `${Math.round(item.trackTimeMillis  60000)} dk`  '';
          const directorOrStudio = item.artistName  'Bilinmiyor';
          const rating = item.contentAdvisoryRating  '';

          results.push({
            external_id `itunes_movie_${item.trackId}`,
            category 'film',
            title item.trackName  'Film',
            poster_url hiResPoster,
            release_year year,
            synopsis item.longDescription  item.shortDescription  'Açıklama bulunmuyor.',
            genres item.primaryGenreName  'Film',
            extra_info `🎬 YönetmenStüdyo ${directorOrStudio}${timeMin  ` • ⏱️ ${timeMin}`  ''}${rating  ` • 🔞 ${rating}`  ''}`
          });
        });
      }
    } catch (e) {}

    return results.slice(0, 24);
  }

   ==========================================================================
   5. DİZİ & 6. ÇİZGİ DİZİ VERİ ÇEKİCİ (TVMaze API - KanalYapımcı Şirket Dahil)
   ==========================================================================
  async function searchSeries(query, isCartoon = false) {
    try {
      let shows = [];
      if (query) {
        const res = await fetchWithTimeout(`httpsapi.tvmaze.comsearchshowsq=${encodeURIComponent(query)}`, {}, 4000);
        if (res.ok) {
          const data = await res.json();
          shows = (data  []).map(d = d.show).filter(Boolean);
        }
      } else {
        const page = isCartoon  1  0;
        const res = await fetchWithTimeout(`httpsapi.tvmaze.comshowspage=${page}`, {}, 4000);
        if (res.ok) {
          const data = await res.json();
          shows = (data  []).sort((a, b) = (b.rating.average  0) - (a.rating.average  0));
        }
      }

      if (isCartoon) {
        const filteredCartoons = shows.filter(s = {
          const isAnim = (s.genres  []).includes('Animation')  s.type === 'Animation';
          const isJapaneseAnime = s.language === 'Japanese'  (s.genres  []).includes('Anime');
          return isAnim && !isJapaneseAnime;
        });
        if (filteredCartoons.length  0  !query) {
          shows = filteredCartoons;
        }
      } else {
        shows = shows.filter(s = !(s.language === 'Japanese' && (s.genres  []).includes('Anime')));
      }

      return shows.slice(0, 24).map(show = {
        const network = show.network.name  show.webChannel.name  'Bağımsız Stüdyo';
        const country = show.network.country.code  show.webChannel.country.code  '';
        const genres = (show.genres  []).join(', ')  (isCartoon  'Çizgi Dizi  Animasyon'  'Dizi');
        const year = show.premiered  show.premiered.slice(0, 4)  '';
        const score = show.rating.average  `⭐ ${show.rating.average}`  '';
        const runtime = show.averageRuntime  show.runtime  `${show.averageRuntime  show.runtime} dk`  '';

        return {
          external_id `tvmaze_${isCartoon  'cartoon'  'series'}_${show.id}`,
          category isCartoon  'cizgi_dizi'  'dizi',
          title show.name  'Dizi',
          poster_url show.image.original  show.image.medium  '',
          release_year year,
          synopsis stripHtmlTags(show.summary)  'Açıklama bulunmuyor.',
          genres genres,
          extra_info `🏢 KanalStüdyo ${network}${country  ` (${country})`  ''}${runtime  ` • ⏱️ ${runtime}`  ''}${score  ` • ${score}`  ''}`
        };
      });
    } catch (e) {
      return [];
    }
  }

   ==========================================================================
   7. ÇİZGİ ROMAN VERİ ÇEKİCİ (Google Books Comics API - Yayıncı Şirket & Yazar Dahil)
   ==========================================================================
  async function searchComics(query) {
    try {
      const searchQ = query
         `${query} comic OR graphic novel`
         `subjectcomics+graphic+novels`;
      const url = `httpswww.googleapis.combooksv1volumesq=${encodeURIComponent(searchQ)}&printType=books&maxResults=24`;
      const res = await fetchWithTimeout(url, {}, 4000);
      if (!res.ok) return [];
      const data = await res.json();

      return (data.items  []).map(item = {
        const info = item.volumeInfo  {};
        const authors = (info.authors  []).slice(0, 2).join(', ')  'Bilinmiyor';
        const publisher = info.publisher  'Çizgi Roman Yayıncısı';
        const pages = info.pageCount  `${info.pageCount} Sayfa`  '';
        const categories = (info.categories  ['Çizgi Roman  Graphic Novel']).join(', ');
        const isMature = info.maturityRating === 'MATURE';
        const rawThumb = info.imageLinks.extraLarge  info.imageLinks.large  info.imageLinks.medium  info.imageLinks.thumbnail  '';
        const httpsThumb = rawThumb.replace(^httpi, 'https').replace('&edge=curl', '');

        return {
          external_id `gbooks_comic_${item.id}`,
          category 'cizgi_roman',
          title info.title  (info.subtitle  `${info.title} ${info.subtitle}`  info.title)  'Çizgi Roman',
          poster_url httpsThumb,
          release_year info.publishedDate  info.publishedDate.slice(0, 4)  '',
          synopsis stripHtmlTags(info.description)  'Açıklama bulunmuyor.',
          genres isMature  `🔞 +18 (Yetişkin), ${categories}`  categories,
          extra_info `🏢 Yayıncı ${publisher} • ✍️ YazarÇizer ${authors}${pages  ` • 📄 ${pages}`  ''}`
        };
      });
    } catch (e) {
      return [];
    }
  }

   ==========================================================================
   UÇ NOKTA 1 KATALOG ARAMA VE POPÜLER LİSTE (catalogsearch)
   ==========================================================================
  app.get('catalogsearch', async (req, res) = {
    const category = (req.query.category  'anime').trim().toLowerCase();
    const q = (req.query.q  '').trim();
    const cacheKey = `${category}__${q.toLowerCase()}`;

    const cached = catalogSearchCache.get(cacheKey);
    if (cached && Date.now()  cached.expires) {
      return res.json({ items cached.items });
    }

    let items = [];
    if (category === 'anime') items = await searchAnime(q);
    else if (category === 'manga') items = await searchManga(q);
    else if (category === 'oyun') items = await searchGames(q);
    else if (category === 'film') items = await searchMovies(q);
    else if (category === 'dizi') items = await searchSeries(q, false);
    else if (category === 'cizgi_dizi') items = await searchSeries(q, true);
    else if (category === 'cizgi_roman') items = await searchComics(q);

    if (items.length  0) {
      catalogSearchCache.set(cacheKey, { items, expires Date.now() + CACHE_TTL_MS });
    }

    res.json({ items });
  });

   ==========================================================================
   UÇ NOKTA 2 İÇERİK LOGLAMA, PUANLAMA VE İNCELEME KAYDETME (cataloglog)
   (Hibrit Model İçeriği önce kendi Supabase media_items tablomuza klonlar!)
   ==========================================================================
  app.post('cataloglog', async (req, res) = {
    const {
      userId,
      category,
      externalId,
      title,
      posterUrl,
      releaseYear,
      synopsis,
      genres,
      extraInfo,
      status,
      score,
      progress,
      reviewText,
      isFavorite
    } = req.body;

    if (!userId  !category  !externalId  !title) {
      return res.status(400).json({ error 'Eksik veri gönderildi.' });
    }

    try {
       1. İçeriği kendi veritabanımıza (media_items) kaydet veya güncelle
      const { data mediaRow, error mediaErr } = await supabase
        .from('media_items')
        .upsert({
          category category.trim().toLowerCase(),
          external_id String(externalId),
          title title.trim(),
          poster_url posterUrl  null,
          release_year releaseYear  String(releaseYear)  null,
          synopsis synopsis  '',
          genres genres  '',
          extra_info extraInfo  ''
        }, { onConflict 'category,external_id' })
        .select()
        .single();

      if (mediaErr) throw mediaErr;

       2. Kullanıcının logpuaninceleme kaydını (user_media_logs) oluştur veya güncelle
      const numScore = Math.min(10, Math.max(0, Number(score)  0));
      const { data logRow, error logErr } = await supabase
        .from('user_media_logs')
        .upsert({
          user_id userId,
          media_id mediaRow.id,
          category category.trim().toLowerCase(),
          status status  'completed',
          score numScore,
          progress (progress  '').trim().slice(0, 60),
          review_text (reviewText  '').trim().slice(0, 2000),
          is_favorite Boolean(isFavorite),
          updated_at new Date().toISOString()
        }, { onConflict 'user_id,media_id' })
        .select()
        .single();

      if (logErr) throw logErr;

      res.json({
        success true,
        log {
          ...logRow,
          media mediaRow
        }
      });
    } catch (err) {
      res.status(500).json({ error err.message });
    }
  });

   ==========================================================================
   UÇ NOKTA 3 KULLANICININ KENDİ LİSTESİNİ GETİR (cataloguser-listuserId)
   ==========================================================================
  app.get('cataloguser-listuserId', async (req, res) = {
    const { userId } = req.params;
    const category = (req.query.category  '').trim().toLowerCase();
    if (!userId) return res.json([]);

    try {
      let queryBuilder = supabase
        .from('user_media_logs')
        .select(', mediamedia_items()')
        .eq('user_id', userId)
        .order('is_favorite', { ascending false })
        .order('updated_at', { ascending false });

      if (category) {
        queryBuilder = queryBuilder.eq('category', category);
      }

      const { data, error } = await queryBuilder;
      if (error) throw error;
      res.json(data  []);
    } catch (err) {
      res.status(500).json({ error err.message });
    }
  });

   ==========================================================================
   UÇ NOKTA 4 LOG SİLME (catalogloglogId)
   ==========================================================================
  app.delete('catalogloglogId', async (req, res) = {
    const { logId } = req.params;
    const { userId } = req.query;
    if (!logId  !userId) return res.status(400).json({ error 'Yetkisiz işlem.' });

    try {
      const { error } = await supabase
        .from('user_media_logs')
        .delete()
        .eq('id', logId)
        .eq('user_id', userId);

      if (error) throw error;
      res.json({ success true });
    } catch (err) {
      res.status(500).json({ error err.message });
    }
  });

   ==========================================================================
   UÇ NOKTA 5 KATEGORİYE GÖRE ANA AKIŞ VE İNCELEMELER (catalogfeed)
   ==========================================================================
  app.get('catalogfeed', async (req, res) = {
    const category = (req.query.category  'anime').trim().toLowerCase();
    const onlyReviews = req.query.reviews === 'true';

    try {
      let queryBuilder = supabase
        .from('user_media_logs')
        .select(', mediamedia_items()')
        .eq('category', category)
        .order('updated_at', { ascending false })
        .limit(40);

      if (onlyReviews) {
        queryBuilder = queryBuilder.neq('review_text', '');
      }

      const { data logs, error } = await queryBuilder;
      if (error) throw error;
      if (!logs  logs.length === 0) return res.json([]);

      const userIds = Array.from(new Set(logs.map(l = l.user_id)));
      const [{ data profiles }, { data bgs }] = await Promise.all([
        supabase.from('profiles').select('user_id, id, display_name').in('user_id', userIds),
        supabase.from('user_backgrounds').select('user_id, avatar_url').in('user_id', userIds)
      ]);

      const profMap = {};
      (profiles  []).forEach(p = { profMap[p.user_id] = p; });
      const bgMap = {};
      (bgs  []).forEach(b = { bgMap[b.user_id] = b.avatar_url; });

      const enriched = logs.map(l = {
        const p = profMap[l.user_id];
        return {
          ...l,
          user_display_name p.display_name  'Üye',
          user_profile_id p.id  null,
          user_avatar_url bgMap[l.user_id]  `httpsapi.dicebear.com9.xloreleisvgseed=${encodeURIComponent(p.display_name  'Uye')}&backgroundColor=72c7ff`
        };
      });

      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error err.message });
    }
  });
};