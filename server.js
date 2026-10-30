const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 55 * 1024 * 1024 } });
const chatBgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const voiceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const MAX_USER_QUOTA_BYTES = 50 * 1024 * 1024;
const MAX_CHAT_BG_BYTES = 10 * 1024 * 1024;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false }
});

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY, secretAccessKey: process.env.R2_SECRET_KEY }
});

const knownProfileUsers = new Set();
const gifSearchCache = new Map();
let onlineUsersCache = { data: null, expires: 0 };

function cleanFileName(name) { return (name || 'dosya').replace(/[^a-zA-Z0-9._-]/g, '_'); }

async function fetchWithTimeout(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ================= MÜZİK VE KOTA =================
app.get('/songs', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Gerekli.' });
  const { data, error } = await supabase
    .from('songs').select('id, user_id, title, url, file_key, file_size, sort_order')
    .eq('user_id', userId).order('sort_order', { ascending: true }).order('id', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  const totalBytes = (data || []).reduce((acc, item) => acc + (Number(item.file_size) || 0), 0);
  res.json({ songs: data || [], totalBytes, maxBytes: MAX_USER_QUOTA_BYTES });
});

app.post('/upload', upload.single('music'), async (req, res) => {
  const userId = req.body.userId;
  if (!userId || !req.file) return res.status(400).json({ error: 'Hata' });
  try {
    const { data: existingSongs } = await supabase.from('songs').select('file_size, sort_order').eq('user_id', userId);
    const usedBytes = (existingSongs || []).reduce((acc, s) => acc + (Number(s.file_size) || 0), 0);
    if (usedBytes + req.file.size > MAX_USER_QUOTA_BYTES) return res.status(400).json({ error: '50 MB limit doldu!' });

    const maxOrder = (existingSongs && existingSongs.length > 0) ? Math.max(...existingSongs.map(s => Number(s.sort_order) || 0)) + 1 : 0;
    const fileKey = `music/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
    
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: fileKey, Body: req.file.buffer, ContentType: req.file.mimetype }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

    const { data, error } = await supabase
      .from('songs').insert([{ title: req.file.originalname, url: publicUrl, user_id: userId, file_key: fileKey, file_size: req.file.size, sort_order: maxOrder }]).select();
    if (error) throw error;
    res.json({ message: 'Yüklendi!', song: data[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/songs/reorder', async (req, res) => {
  const { userId, orderedIds } = req.body;
  if (!userId || !Array.isArray(orderedIds)) return res.status(400).json({ error: 'Geçersiz veri.' });
  try {
    await Promise.all(orderedIds.map((songId, index) => supabase.from('songs').update({ sort_order: index }).eq('id', songId).eq('user_id', userId)));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/songs/:id', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;
  if (!userId) return res.status(401).json({ error: 'Yetkisiz' });
  try {
    const { data: song } = await supabase.from('songs').select('id, file_key').eq('id', id).eq('user_id', userId).single();
    if (!song) return res.status(404).json({ error: 'Bulunamadı' });
    await Promise.all([
      song.file_key ? s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: song.file_key })).catch(() => {}) : Promise.resolve(),
      supabase.from('songs').delete().eq('id', id).eq('user_id', userId)
    ]);
    res.json({ message: 'Silindi' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= PROFİL YÖNETİMİ =================
app.get('/profile-settings', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.json({});
  try {
    const [{ data }, { data: prof }] = await Promise.all([
      supabase.from('user_backgrounds').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('profiles').select('id, display_name, bio').eq('user_id', userId).maybeSingle()
    ]);
    if (prof) knownProfileUsers.add(userId);
    res.json({
      displayName: prof?.display_name || null, profileId: prof?.id || null, bio: prof?.bio || '',
      bgUrl: data?.bg_url || null, chatBgUrl: data?.chat_bg_url || null, avatarUrl: data?.avatar_url || null,
      panelColor: data?.panel_color || '#73c8fa', panelOpacity: data?.panel_opacity !== null && data?.panel_opacity !== undefined ? Number(data.panel_opacity) : 0.48,
      bgOpacity: data?.bg_opacity !== null && data?.bg_opacity !== undefined ? Number(data.bg_opacity) : 1.0,
      bgBlur: data?.bg_blur !== null && data?.bg_blur !== undefined ? Number(data.bg_blur) : 0, autoPlay: data?.auto_play === true
    });
  } catch (err) { res.json({}); }
});

app.post('/profile/bio', async (req, res) => {
  const { userId, bio } = req.body;
  if (!userId) return res.status(400).json({ error: 'Yetkisiz işlem.' });
  const cleanBio = (bio || '').trim().slice(0, 300);
  try {
    const { error } = await supabase.from('profiles').update({ bio: cleanBio || 'Henüz bir hakkında yazısı eklenmemiş.' }).eq('user_id', userId);
    if (error) throw error;
    res.json({ success: true, bio: cleanBio || 'Henüz bir hakkında yazısı eklenmemiş.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/username', async (req, res) => {
  const { userId, username } = req.body;
  if (!userId || !username) return res.status(400).json({ error: 'Kullanıcı adı boş olamaz.' });
  const cleanName = username.trim();
  if (cleanName.length < 3 || cleanName.length > 20) return res.status(400).json({ error: '3-20 karakter arasında olmalı.' });

  try {
    const { data: existing } = await supabase.from('profiles').select('user_id, display_name').ilike('display_name', cleanName);
    const isTaken = existing && existing.some(p => p.user_id !== userId && p.display_name && p.display_name.toLowerCase() === cleanName.toLowerCase());
    if (isTaken) return res.status(400).json({ error: 'Bu kullanıcı adı alınmış!' });

    const { error } = await supabase.from('profiles').update({ display_name: cleanName }).eq('user_id', userId);
    if (error) throw error;
    onlineUsersCache.expires = 0;
    res.json({ success: true, displayName: cleanName });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/background', upload.single('background'), async (req, res) => {
  const userId = req.body.userId;
  if (!userId || !req.file) return res.status(400).json({ error: 'Hata' });
  try {
    const { data: oldData } = await supabase.from('user_backgrounds').select('file_key').eq('user_id', userId).maybeSingle();
    const fileKey = `backgrounds/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
    await Promise.all([
      oldData && oldData.file_key ? s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: oldData.file_key })).catch(() => {}) : Promise.resolve(),
      s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: fileKey, Body: req.file.buffer, ContentType: req.file.mimetype }))
    ]);
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;
    await supabase.from('user_backgrounds').upsert({ user_id: userId, bg_url: publicUrl, file_key: fileKey }, { onConflict: 'user_id' });
    res.json({ bgUrl: publicUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/avatar', upload.single('avatar'), async (req, res) => {
  const userId = req.body.userId;
  if (!userId || !req.file) return res.status(400).json({ error: 'Hata' });
  try {
    const { data: oldData } = await supabase.from('user_backgrounds').select('avatar_key').eq('user_id', userId).maybeSingle();
    const avatarKey = `avatars/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
    await Promise.all([
      oldData && oldData.avatar_key ? s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: oldData.avatar_key })).catch(() => {}) : Promise.resolve(),
      s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: avatarKey, Body: req.file.buffer, ContentType: req.file.mimetype }))
    ]);
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${avatarKey}`;
    await supabase.from('user_backgrounds').upsert({ user_id: userId, avatar_url: publicUrl, avatar_key: avatarKey }, { onConflict: 'user_id' });
    onlineUsersCache.expires = 0;
    res.json({ avatarUrl: publicUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/theme', async (req, res) => {
  const { userId, panelColor, panelOpacity, bgOpacity, bgBlur, autoPlay } = req.body;
  if (!userId) return res.status(401).json({ error: 'Yetkisiz' });
  const updatePayload = {
    user_id: userId, panel_color: panelColor || '#73c8fa',
    panel_opacity: panelOpacity !== undefined && panelOpacity !== null ? Number(panelOpacity) : 0.48,
    bg_opacity: bgOpacity !== undefined && bgOpacity !== null ? Number(bgOpacity) : 1.0,
    bg_blur: bgBlur !== undefined && bgBlur !== null ? Number(bgBlur) : 0
  };
  if (autoPlay !== undefined) updatePayload.auto_play = Boolean(autoPlay);
  const { error } = await supabase.from('user_backgrounds').upsert(updatePayload, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get('/my-profile-id', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Gerekli' });
  let { data } = await supabase.from('profiles').select('id, display_name').eq('user_id', userId).maybeSingle();
  if (!data) {
    const { data: inserted } = await supabase.from('profiles').insert([{ user_id: userId, display_name: 'Üye' }]).select('id, display_name').maybeSingle();
    data = inserted;
  }
  if (!data) return res.status(404).json({ error: 'Bulunamadı' });
  knownProfileUsers.add(userId);
  res.json({ profileId: data.id, displayName: data.display_name });
});

app.get('/user-profile/:id', async (req, res) => {
  const shortId = req.params.id;
  const viewerId = req.query.viewerId;

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', shortId).maybeSingle();
  if (!profile) return res.status(404).json({ error: 'Bulunamadı' });
  const realUserId = profile.user_id;

  const queries = [
    supabase.from('user_backgrounds').select('*').eq('user_id', realUserId).maybeSingle(),
    supabase.from('songs').select('id, title, url, file_size, sort_order').eq('user_id', realUserId).order('sort_order', { ascending: true }).order('id', { ascending: true })
  ];

  if (viewerId) {
    queries.push(supabase.from('user_backgrounds').select('auto_play').eq('user_id', viewerId).maybeSingle());
    if (viewerId !== realUserId) {
      queries.push(supabase.from('friendships').select('status').or(`and(sender_id.eq.${viewerId},receiver_id.eq.${realUserId}),and(sender_id.eq.${realUserId},receiver_id.eq.${viewerId})`).maybeSingle());
    }
  }

  const results = await Promise.all(queries);
  const settings = results[0]?.data || null;
  const songs = results[1]?.data || [];
  const viewerSettings = viewerId ? results[2]?.data : null;
  const rel = (viewerId && viewerId !== realUserId) ? results[3]?.data : null;

  res.json({
    realUserId, displayName: profile.display_name, createdAt: profile.created_at, bio: profile.bio || 'Henüz bir hakkında yazısı eklenmemiş.',
    friendshipStatus: (rel && rel.status) ? rel.status : 'none', viewerAutoPlay: viewerSettings?.auto_play === true, ownerAutoPlay: settings?.auto_play === true,
    avatarUrl: settings?.avatar_url || `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(profile.display_name || 'Anon')}&backgroundColor=72c7ff`,
    bgUrl: settings?.bg_url || '/arkaplan.jpg', panelColor: settings?.panel_color || '#73c8fa',
    panelOpacity: settings?.panel_opacity !== null && settings?.panel_opacity !== undefined ? Number(settings.panel_opacity) : 0.48,
    bgOpacity: settings?.bg_opacity !== null && settings?.bg_opacity !== undefined ? Number(settings.bg_opacity) : 1.0,
    bgBlur: settings?.bg_blur !== null && settings?.bg_blur !== undefined ? Number(settings.bg_blur) : 0, songs
  });
});

// ================= ARKADAŞLIK VE AKTİFLİK =================
app.post('/ping', async (req, res) => {
  const { userId, defaultName } = req.body;
  if (!userId) return res.json({ success: false });

  const nowIso = new Date().toISOString();
  if (knownProfileUsers.has(userId)) {
    await supabase.from('profiles').update({ last_seen: nowIso }).eq('user_id', userId);
    return res.json({ success: true });
  }

  const { data: existingProf } = await supabase.from('profiles').select('id, display_name').eq('user_id', userId).maybeSingle();
  if (!existingProf) {
    await supabase.from('profiles').insert([{ user_id: userId, display_name: defaultName || 'Üye', last_seen: nowIso }]);
  } else {
    const updateObj = { last_seen: nowIso };
    if (!existingProf.display_name && defaultName) updateObj.display_name = defaultName;
    await supabase.from('profiles').update(updateObj).eq('user_id', userId);
  }
  knownProfileUsers.add(userId);
  res.json({ success: true });
});

app.post('/logout', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.json({ success: false });
  const pastDate = new Date(Date.now() - 10 * 60000).toISOString();
  await supabase.from('profiles').update({ last_seen: pastDate }).eq('user_id', userId);
  onlineUsersCache.expires = 0;
  res.json({ success: true });
});

app.get('/online-users', async (req, res) => {
  if (onlineUsersCache.data && Date.now() < onlineUsersCache.expires) return res.json(onlineUsersCache.data);
  const twoMinsAgo = new Date(Date.now() - 2 * 60000).toISOString();
  const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, id').gte('last_seen', twoMinsAgo).limit(80);
  if (!profiles || profiles.length === 0) {
    onlineUsersCache = { data: [], expires: Date.now() + 8000 };
    return res.json([]);
  }
  const userIds = profiles.map(p => p.user_id);
  const { data: bgs } = await supabase.from('user_backgrounds').select('user_id, avatar_url').in('user_id', userIds);
  const bgMap = {}; (bgs || []).forEach(b => { bgMap[b.user_id] = b.avatar_url; });
  const result = profiles.map(p => ({ ...p, avatar_url: bgMap[p.user_id] || `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(p.display_name || 'Uye')}&backgroundColor=72c7ff` }));
  onlineUsersCache = { data: result, expires: Date.now() + 8000 };
  res.json(result);
});

app.post('/friends/request', async (req, res) => {
  const { senderId, receiverId } = req.body;
  if (!senderId || !receiverId) return res.status(400).json({ error: 'Eksik bilgi.' });
  if (senderId === receiverId) return res.status(400).json({ error: 'Kendinize istek gönderemezsiniz.' });
  const { data: existing } = await supabase.from('friendships').select('id, status').or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`);
  const record = existing && existing.length > 0 ? existing[0] : null;

  if (record) {
    if (record.status === 'pending') return res.status(400).json({ error: 'Zaten bekleyen bir istek var.' });
    if (record.status === 'accepted') return res.status(400).json({ error: 'Zaten arkadaşsınız.' });
    if (record.status === 'rejected') await supabase.from('friendships').delete().eq('id', record.id);
  }
  const { error } = await supabase.from('friendships').insert({ sender_id: senderId, receiver_id: receiverId, status: 'pending' });
  if (error) return res.status(500).json({ error: `DB Hatası: ${error.message}` });
  res.json({ success: true });
});

app.post('/friends/remove', async (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId) return res.status(400).json({ error: 'Eksik bilgi.' });
  try {
    await Promise.all([
      supabase.from('friendships').delete().eq('sender_id', userId).eq('receiver_id', friendId),
      supabase.from('friendships').delete().eq('sender_id', friendId).eq('receiver_id', userId)
    ]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/friends/requests/:userId', async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabase.from('friendships').select('id, sender_id').eq('receiver_id', userId).eq('status', 'pending');
  if (error || !data || data.length === 0) return res.json([]);

  const senderIds = data.map(d => d.sender_id);
  const [{ data: profiles }, { data: bgs }] = await Promise.all([
    supabase.from('profiles').select('user_id, display_name').in('user_id', senderIds),
    supabase.from('user_backgrounds').select('user_id, avatar_url').in('user_id', senderIds)
  ]);
  const profMap = {}; (profiles || []).forEach(p => { profMap[p.user_id] = p.display_name; });
  const bgMap = {}; (bgs || []).forEach(b => { bgMap[b.user_id] = b.avatar_url; });

  const result = data.map(reqItem => ({
    id: reqItem.id, sender_id: reqItem.sender_id, display_name: profMap[reqItem.sender_id] || 'Gizemli Üye',
    avatar_url: bgMap[reqItem.sender_id] || `https://api.dicebear.com/9.x/lorelei/svg?seed=Anon&backgroundColor=72c7ff`
  }));
  res.json(result);
});

app.post('/friends/respond', async (req, res) => {
  const { requestId, status } = req.body;
  if (status === 'rejected') {
    const { error } = await supabase.from('friendships').delete().eq('id', requestId);
    if (error) return res.status(500).json({ error: error.message });
  } else {
    const { error } = await supabase.from('friendships').update({ status }).eq('id', requestId);
    if (error) return res.status(500).json({ error: error.message });
  }
  res.json({ success: true });
});

app.get('/friends/:userId', async (req, res) => {
  const { userId } = req.params;
  const { data } = await supabase.from('friendships').select('sender_id, receiver_id').eq('status', 'accepted').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
  if (!data || data.length === 0) return res.json([]);
  
  const friendIds = data.map(d => d.sender_id === userId ? d.receiver_id : d.sender_id);

  const [{ data: profiles }, { data: bgs }, { data: recentMsgs }] = await Promise.all([
    supabase.from('profiles').select('user_id, display_name, id, last_seen').in('user_id', friendIds),
    supabase.from('user_backgrounds').select('user_id, avatar_url').in('user_id', friendIds),
    supabase.from('messages').select('sender_id, receiver_id, group_id, created_at, is_read').is('group_id', null).or(`sender_id.eq.${userId},receiver_id.eq.${userId}`).order('created_at', { ascending: false }).limit(400)
  ]);

  const lastMsgMap = {}; const unreadFromMap = {};
  if (recentMsgs) {
    for (const m of recentMsgs) {
      if (m.group_id) continue;
      const otherId = m.sender_id === userId ? m.receiver_id : m.sender_id;
      if (otherId && !lastMsgMap[otherId]) lastMsgMap[otherId] = m.created_at;
      if (m.receiver_id === userId && m.is_read === false) unreadFromMap[m.sender_id] = (unreadFromMap[m.sender_id] || 0) + 1;
    }
  }

  const profMap = {}; (profiles || []).forEach(p => { profMap[p.user_id] = p; });
  const bgMap = {}; (bgs || []).forEach(b => { bgMap[b.user_id] = b.avatar_url; });
  const twoMinsAgo = new Date(Date.now() - 2 * 60000).toISOString();

  const result = friendIds.map(fid => {
    const prof = profMap[fid];
    if (!prof) return null;
    return {
      user_id: fid, profile_id: prof.id, display_name: prof.display_name || 'Üye',
      avatar_url: bgMap[fid] || `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(prof.display_name || 'Uye')}&backgroundColor=72c7ff`,
      is_online: prof.last_seen > twoMinsAgo, last_message_at: lastMsgMap[fid] || null, unread_count: unreadFromMap[fid] || 0
    };
  }).filter(Boolean);
  res.json(result);
});

// ================= SOHBET, GRUPLAR VE MEDYA =================

app.get('/chat/gifs', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  const cacheKey = q || '__trending__';
  const cached = gifSearchCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return res.json({ gifs: cached.gifs });

  try {
    const tenorEndpoint = q ? `https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=LIVDSRZULELA&limit=24` : `https://g.tenor.com/v1/trending?key=LIVDSRZULELA&limit=24`;
    const tRes = await fetchWithTimeout(tenorEndpoint, 2200);
    if (tRes.ok) {
      const tJson = await tRes.json();
      const tUrls = (tJson.results || []).map(item => item.media?.[0]?.tinygif?.url || item.media?.[0]?.gif?.url).filter(Boolean);
      if (tUrls.length > 0) {
        gifSearchCache.set(cacheKey, { gifs: tUrls, expires: Date.now() + 5 * 60000 });
        return res.json({ gifs: tUrls });
      }
    }
  } catch (err) {}

  try {
    const giphyKey = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC';
    const endpoint = q ? `https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13` : `https://api.giphy.com/v1/gifs/trending?api_key=${giphyKey}&limit=24&rating=pg-13`;
    const response = await fetchWithTimeout(endpoint, 2200);
    if (response.ok) {
      const json = await response.json();
      const urls = (json.data || []).map(item => item.images?.fixed_height_small?.url || item.images?.fixed_height?.url || item.images?.original?.url).filter(Boolean);
      if (urls.length > 0) gifSearchCache.set(cacheKey, { gifs: urls, expires: Date.now() + 5 * 60000 });
      return res.json({ gifs: urls });
    }
  } catch (err) {}
  res.json({ gifs: [] });
});

app.post('/chat/mark-read', async (req, res) => {
  const { readerId, senderId } = req.body;
  if (!readerId || !senderId) return res.json({ success: false });
  try {
    await supabase.from('messages').update({ is_read: true }).eq('receiver_id', readerId).eq('sender_id', senderId).eq('is_read', false);
    res.json({ success: true });
  } catch (err) { res.json({ success: true }); }
});

// GRUP OLUŞTURMA (Yönetici Sistemi)
app.post('/chat/groups/create', async (req, res) => {
  const { name, creatorId, memberIds } = req.body;
  if (!name || !creatorId) return res.status(400).json({ error: 'Grup adı gerekli.' });
  const cleanName = name.trim().slice(0, 35);
  const avatarUrl = `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(cleanName)}&backgroundColor=72c7ff`;

  try {
    const { data: group, error: gErr } = await supabase.from('chat_groups').insert([{ name: cleanName, avatar_url: avatarUrl, created_by: creatorId }]).select().single();
    if (gErr) throw gErr;
    const allMembers = Array.from(new Set([creatorId, ...(Array.isArray(memberIds) ? memberIds : [])]));
    const memberRows = allMembers.map(uid => ({ group_id: group.id, user_id: uid }));
    await supabase.from('chat_group_members').insert(memberRows);
    res.json({ success: true, group });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GRUP BİLDİRİM: SON OKUMA TARİHİNİ GÜNCELLE
app.post('/chat/groups/mark-read', async (req, res) => {
    const { userId, groupId } = req.body;
    if (!userId || !groupId) return res.json({ success: false });
    try {
        await supabase.from('chat_group_members').update({ last_read_at: new Date().toISOString() }).eq('user_id', userId).eq('group_id', groupId);
        res.json({ success: true });
    } catch(err) { res.json({ success: false }); }
});

// KULLANICININ GRUPLARINI GETİR (Bildirim Rozetleri Dahil)
app.get('/chat/groups/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.json([]);
  try {
    const { data: memberships } = await supabase.from('chat_group_members').select('group_id, last_read_at').eq('user_id', userId);
    if (!memberships || memberships.length === 0) return res.json([]);
    
    const groupIds = memberships.map(m => m.group_id);
    const lastReadMap = {};
    memberships.forEach(m => { lastReadMap[m.group_id] = m.last_read_at || new Date(0).toISOString(); });

    const [{ data: groups }, { data: allMembers }, { data: recentGroupMsgs }] = await Promise.all([
      supabase.from('chat_groups').select('*').in('id', groupIds),
      supabase.from('chat_group_members').select('group_id, user_id').in('group_id', groupIds),
      supabase.from('messages').select('group_id, created_at').in('group_id', groupIds).order('created_at', { ascending: false }).limit(300)
    ]);

    const lastGroupMsgMap = {};
    const unreadCountMap = {};

    if (recentGroupMsgs) {
      for (const gm of recentGroupMsgs) {
        if (gm.group_id && !lastGroupMsgMap[gm.group_id]) lastGroupMsgMap[gm.group_id] = gm.created_at;
        if (gm.group_id && new Date(gm.created_at) > new Date(lastReadMap[gm.group_id])) {
            unreadCountMap[gm.group_id] = (unreadCountMap[gm.group_id] || 0) + 1;
        }
      }
    }

    const memberCountMap = {};
    (allMembers || []).forEach(m => { memberCountMap[m.group_id] = (memberCountMap[m.group_id] || 0) + 1; });

    const result = (groups || []).map(g => ({
      ...g,
      member_count: memberCountMap[g.id] || 1,
      last_message_at: lastGroupMsgMap[g.id] || g.created_at,
      unread_count: unreadCountMap[g.id] || 0
    }));

    result.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
    res.json(result);
  } catch (err) { res.json([]); }
});

// GRUP ÜYELERİNİ GETİR (Grup Ayarları İçin)
app.get('/chat/groups/:groupId/members', async (req, res) => {
    const { groupId } = req.params;
    const { data: members } = await supabase.from('chat_group_members').select('user_id, joined_at').eq('group_id', groupId);
    if (!members) return res.json([]);
    const ids = members.map(m => m.user_id);
    
    const [{ data: profs }, { data: bgs }] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name').in('user_id', ids),
        supabase.from('user_backgrounds').select('user_id, avatar_url').in('user_id', ids)
    ]);
    const result = members.map(m => {
        const p = profs?.find(x => x.user_id === m.user_id);
        const b = bgs?.find(x => x.user_id === m.user_id);
        return {
            user_id: m.user_id,
            display_name: p?.display_name || 'Üye',
            joined_at: m.joined_at,
            avatar_url: b?.avatar_url || `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(p?.display_name || 'Uye')}&backgroundColor=72c7ff`
        };
    });
    res.json(result);
});

// GRUP PROFİL RESMİ DEĞİŞTİRME (Sadece Yönetici)
app.post('/chat/groups/:groupId/avatar', upload.single('avatar'), async (req, res) => {
    const { groupId } = req.params;
    const { userId } = req.body;
    
    const { data: group } = await supabase.from('chat_groups').select('*').eq('id', groupId).single();
    if (!group || group.created_by !== userId) return res.status(403).json({error: 'Sadece grup yöneticisi resmi değiştirebilir.'});

    if (group.avatar_key) {
        await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: group.avatar_key })).catch(()=>{});
    }

    const avatarKey = `groups/${groupId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: avatarKey, Body: req.file.buffer, ContentType: req.file.mimetype }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${avatarKey}`;

    await supabase.from('chat_groups').update({ avatar_url: publicUrl, avatar_key: avatarKey }).eq('id', groupId);
    res.json({ success: true, avatarUrl: publicUrl });
});

// GRUP YÖNETİCİLİĞİNİ DEVRET
app.post('/chat/groups/:groupId/transfer', async (req, res) => {
    const { groupId } = req.params;
    const { userId, newAdminId } = req.body;
    
    const { data: group } = await supabase.from('chat_groups').select('created_by').eq('id', groupId).single();
    if (!group || group.created_by !== userId) return res.status(403).json({error: 'Yetkiniz yok.'});

    await supabase.from('chat_groups').update({ created_by: newAdminId }).eq('id', groupId);
    res.json({ success: true });
});

// GRUPTAN AYRILMA VEYA ÜYE ATMA (Otomatik Temizleme ile)
app.post('/chat/groups/:groupId/leave', async (req, res) => {
    const { groupId } = req.params;
    const { userId, targetId } = req.body;
    const target = targetId || userId;

    const { data: group } = await supabase.from('chat_groups').select('*').eq('id', groupId).single();
    if (!group) return res.status(404).json({error: 'Grup bulunamadı'});

    if (target !== userId && group.created_by !== userId) {
        return res.status(403).json({error: 'Sadece grup yöneticisi üyeleri çıkarabilir.'});
    }

    // Üyeyi Gruptan Sil
    await supabase.from('chat_group_members').delete().eq('group_id', groupId).eq('user_id', target);

    const { data: remaining } = await supabase.from('chat_group_members').select('user_id').eq('group_id', groupId).order('joined_at', { ascending: true });

    // HİÇ ÜYE KALMADIYSA GRUBU KÖKTEN SİL
    if (!remaining || remaining.length === 0) {
        if (group.avatar_key) {
            await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: group.avatar_key })).catch(()=>{});
        }
        await supabase.from('messages').delete().eq('group_id', groupId);
        await supabase.from('chat_groups').delete().eq('id', groupId);
        return res.json({ success: true, deleted: true });
    }

    // EĞER AYRILAN VEYA ATILAN KİŞİ YÖNETİCİYSE, OTOMATİK OLARAK EN ESKİ ÜYEYE DEVRET
    if (group.created_by === target) {
        await supabase.from('chat_groups').update({ created_by: remaining[0].user_id }).eq('id', groupId);
    }

    res.json({ success: true, deleted: false });
});

// MESAJLAŞMA UÇ NOKTALARI
app.get('/chat/messages', async (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'Eksik bilgi.' });
  const { data, error } = await supabase.from('messages').select('*').is('group_id', null).or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`).order('created_at', { ascending: true }).limit(250);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/chat/group-messages', async (req, res) => {
  const { groupId } = req.query;
  if (!groupId) return res.status(400).json({ error: 'Grup ID gerekli.' });
  try {
    const { data: msgs, error } = await supabase.from('messages').select('*').eq('group_id', groupId).order('created_at', { ascending: true }).limit(250);
    if (error) throw error;
    const senderIds = Array.from(new Set((msgs || []).map(m => m.sender_id)));
    let nameMap = {};
    if (senderIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', senderIds);
      (profs || []).forEach(p => { nameMap[p.user_id] = p.display_name; });
    }
    const enriched = (msgs || []).map(m => ({ ...m, sender_name: nameMap[m.sender_id] || 'Üye' }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/chat/upload-voice', voiceUpload.single('voice'), async (req, res) => {
  const { senderId } = req.body;
  if (!senderId || !req.file) return res.status(400).json({ error: 'Ses kaydı bulunamadı.' });
  try {
    const fileKey = `chat_voice/${senderId}/${Date.now()}-sesli_mesaj.webm`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: fileKey, Body: req.file.buffer, ContentType: req.file.mimetype || 'audio/webm' }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;
    res.json({ publicUrl, fileKey, fileName: 'Sesli Mesaj', fileSize: req.file.size });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/chat/send', async (req, res) => {
  const { senderId, receiverId, groupId, content, attachmentUrl, attachmentKey, attachmentName, attachmentType, attachmentSize } = req.body;
  if (!senderId || (!receiverId && !groupId)) return res.status(400).json({ error: 'Gönderici veya alıcı/grup eksik.' });
  try {
    const insertPayload = {
      sender_id: senderId, receiver_id: groupId ? null : receiverId,
      content: content || '', attachment_url: attachmentUrl || null, attachment_key: attachmentKey || null,
      attachment_name: attachmentName || null, attachment_type: attachmentType || null,
      attachment_size: Number(attachmentSize) || 0, is_large_file: false, expires_at: null,
      is_expired_deleted: false, is_pinned: false, is_read: false
    };
    if (groupId) insertPayload.group_id = Number(groupId);
    const { data, error } = await supabase.from('messages').insert([insertPayload]).select().single();
    if (error) throw error;
    res.json({ success: true, message: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/chat/pin', async (req, res) => {
  const { messageId, isPinned } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Mesaj ID gerekli.' });
  try {
    const { data, error } = await supabase.from('messages').update({ is_pinned: Boolean(isPinned) }).eq('id', messageId).select().single();
    if (error) throw error;
    res.json({ success: true, message: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/chat/background', (req, res) => {
  chatBgUpload.single('chatBg')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Sohbet arka planı maksimum 10 MB olabilir!' : err.message });
    const userId = req.body.userId;
    if (!userId || !req.file) return res.status(400).json({ error: 'Dosya seçilmedi.' });
    if (req.file.size > MAX_CHAT_BG_BYTES) return res.status(400).json({ error: 'Sohbet arka planı maksimum 10 MB olabilir!' });

    try {
      const { data: oldData } = await supabase.from('user_backgrounds').select('chat_bg_key').eq('user_id', userId).maybeSingle();
      const fileKey = `chat_backgrounds/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
      await Promise.all([
        oldData && oldData.chat_bg_key ? s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: oldData.chat_bg_key })).catch(() => {}) : Promise.resolve(),
        s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: fileKey, Body: req.file.buffer, ContentType: req.file.mimetype }))
      ]);
      const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;
      await supabase.from('user_backgrounds').upsert({ user_id: userId, chat_bg_url: publicUrl, chat_bg_key: fileKey }, { onConflict: 'user_id' });
      res.json({ chatBgUrl: publicUrl });
    } catch (uploadErr) { res.status(500).json({ error: uploadErr.message }); }
  });
});

app.post('/chat/background/reset', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Yetkisiz' });
  try {
    const { data: oldData } = await supabase.from('user_backgrounds').select('chat_bg_key').eq('user_id', userId).maybeSingle();
    await Promise.all([
      oldData && oldData.chat_bg_key ? s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: oldData.chat_bg_key })).catch(() => {}) : Promise.resolve(),
      supabase.from('user_backgrounds').update({ chat_bg_url: null, chat_bg_key: null }).eq('user_id', userId)
    ]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));