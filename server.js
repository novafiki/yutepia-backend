const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const MAX_USER_QUOTA_BYTES = 50 * 1024 * 1024; 

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY, secretAccessKey: process.env.R2_SECRET_KEY }
});

function cleanFileName(name) { return name.replace(/[^a-zA-Z0-9._-]/g, '_'); }

// 1. Müzik İşlemleri (Eski Kodlar)
app.get('/songs', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Kullanıcı ID gerekli.' });
  const { data, error } = await supabase.from('songs').select('*').eq('user_id', userId).order('id', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  const totalBytes = data.reduce((acc, item) => acc + (Number(item.file_size) || 0), 0);
  res.json({ songs: data, totalBytes, maxBytes: MAX_USER_QUOTA_BYTES });
});

app.post('/upload', upload.single('music'), async (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(401).json({ error: 'Önce giriş yapmalısınız.' });
  if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı.' });
  try {
    const { data: existingSongs } = await supabase.from('songs').select('file_size').eq('user_id', userId);
    const usedBytes = existingSongs.reduce((acc, s) => acc + (Number(s.file_size) || 0), 0);
    if (usedBytes + req.file.size > MAX_USER_QUOTA_BYTES) return res.status(400).json({ error: 'Kota dolu!' });
    const fileKey = `music/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: fileKey, Body: req.file.buffer, ContentType: req.file.mimetype }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;
    const { data, error } = await supabase.from('songs').insert([{ title: req.file.originalname, url: publicUrl, user_id: userId, file_key: fileKey, file_size: req.file.size }]).select();
    if (error) throw error;
    res.json({ message: 'Şarkı başarıyla yüklendi!', song: data[0] });
  } catch (err) { res.status(500).json({ error: 'Yükleme hatası: ' + err.message }); }
});

app.delete('/songs/:id', async (req, res) => {
  const songId = req.params.id; const userId = req.query.userId;
  if (!userId) return res.status(401).json({ error: 'Yetkisiz işlem.' });
  try {
    const { data: song } = await supabase.from('songs').select('*').eq('id', songId).eq('user_id', userId).single();
    if (!song) return res.status(404).json({ error: 'Bulunamadı.' });
    if (song.file_key) await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: song.file_key }));
    await supabase.from('songs').delete().eq('id', songId).eq('user_id', userId);
    res.json({ message: 'Silindi.' });
  } catch (err) { res.status(500).json({ error: 'Silme hatası' }); }
});

// 2. Profil Ayarları (Eski Kodlar)
app.get('/profile-settings', async (req, res) => {
  const { userId } = req.query; if (!userId) return res.json({});
  const { data } = await supabase.from('user_backgrounds').select('*').eq('user_id', userId).maybeSingle();
  res.json({ bgUrl: data?.bg_url || null, avatarUrl: data?.avatar_url || null, panelColor: data?.panel_color || '#73c8fa', panelOpacity: data?.panel_opacity !== null ? data.panel_opacity : 0.48 });
});

app.post('/background', upload.single('background'), async (req, res) => { /*...aynı...*/ 
  const userId = req.body.userId;
  const fileKey = `backgrounds/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
  await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: fileKey, Body: req.file.buffer, ContentType: req.file.mimetype }));
  const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;
  await supabase.from('user_backgrounds').upsert({ user_id: userId, bg_url: publicUrl, file_key: fileKey }, { onConflict: 'user_id' });
  res.json({ bgUrl: publicUrl });
});

app.post('/avatar', upload.single('avatar'), async (req, res) => { /*...aynı...*/ 
  const userId = req.body.userId;
  const avatarKey = `avatars/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
  await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: avatarKey, Body: req.file.buffer, ContentType: req.file.mimetype }));
  const publicUrl = `${process.env.R2_PUBLIC_URL}/${avatarKey}`;
  await supabase.from('user_backgrounds').upsert({ user_id: userId, avatar_url: publicUrl, avatar_key: avatarKey }, { onConflict: 'user_id' });
  res.json({ avatarUrl: publicUrl });
});

app.post('/theme', async (req, res) => {
  const { userId, panelColor, panelOpacity } = req.body;
  await supabase.from('user_backgrounds').upsert({ user_id: userId, panel_color: panelColor || '#73c8fa', panel_opacity: Number(panelOpacity) }, { onConflict: 'user_id' });
  res.json({ message: 'Kaydedildi' });
});

app.get('/my-profile-id', async (req, res) => {
  const { data } = await supabase.from('profiles').select('id').eq('user_id', req.query.userId).single();
  res.json({ profileId: data?.id });
});

app.get('/user-profile/:id', async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('user_id').eq('id', req.params.id).single();
  if (!profile) return res.status(404).json({ error: 'Bulunamadı' });
  const realUserId = profile.user_id;
  const { data: settings } = await supabase.from('user_backgrounds').select('*').eq('user_id', realUserId).maybeSingle();
  const { data: songs } = await supabase.from('songs').select('id, title, url').eq('user_id', realUserId);
  res.json({ avatarUrl: settings?.avatar_url || 'https://api.dicebear.com/9.x/lorelei/svg?seed=Anon', bgUrl: settings?.bg_url || './arkaplan.jpg', panelColor: settings?.panel_color || '#73c8fa', panelOpacity: settings?.panel_opacity !== undefined ? settings?.panel_opacity : 0.48, songs: songs || [] });
});

// ==========================================
// YENİ: KULLANICI LİSTESİ VE ARKADAŞLIK SİSTEMİ
// ==========================================

// Tüm kayıtlı kullanıcıları getir (Sağ paneli doldurmak için)
app.get('/users', async (req, res) => {
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: bgs } = await supabase.from('user_backgrounds').select('*');
    
    const users = profiles.map(p => {
        const bg = bgs.find(b => b.user_id === p.user_id);
        const defaultName = p.email ? p.email.split('@')[0] : `User ${p.id}`;
        return {
            shortId: p.id,
            userId: p.user_id,
            name: defaultName,
            avatarUrl: bg?.avatar_url || `https://api.dicebear.com/9.x/lorelei/svg?seed=${defaultName}&backgroundColor=72c7ff`
        };
    });
    res.json(users);
});

// Arkadaşlık İsteği Gönder
app.post('/friends/request', async (req, res) => {
    const { requesterId, receiverId } = req.body;
    const { error } = await supabase.from('friendships').insert([{ requester_id: requesterId, receiver_id: receiverId, status: 'pending' }]);
    if (error) return res.status(400).json({ error: 'İstek zaten gönderildi veya geçersiz.' });
    res.json({ success: true });
});

// Gelen Bekleyen İstekleri Listele (Bildirim Kutusu İçin)
app.get('/friends/requests', async (req, res) => {
    const { userId } = req.query;
    const { data: requests } = await supabase.from('friendships').select('*').eq('receiver_id', userId).eq('status', 'pending');
    
    // İstek atanların profil bilgilerini çekelim
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: bgs } = await supabase.from('user_backgrounds').select('*');

    const result = requests.map(req => {
        const p = profiles.find(pr => pr.user_id === req.requester_id);
        const bg = bgs.find(b => b.user_id === req.requester_id);
        const name = p?.email ? p.email.split('@')[0] : `User ${p?.id}`;
        return {
            requestId: req.id,
            requesterId: req.requester_id,
            shortId: p?.id,
            name: name,
            avatarUrl: bg?.avatar_url || `https://api.dicebear.com/9.x/lorelei/svg?seed=${name}&backgroundColor=72c7ff`
        };
    });
    res.json(result);
});

// İsteği Kabul Et veya Reddet
app.post('/friends/respond', async (req, res) => {
    const { requestId, status } = req.body; // status: 'accepted' veya 'rejected'
    if (status === 'accepted') {
        await supabase.from('friendships').update({ status: 'accepted' }).eq('id', requestId);
    } else {
        await supabase.from('friendships').delete().eq('id', requestId);
    }
    res.json({ success: true });
});

// Kullanıcının Kabul Edilmiş Arkadaşlarını Listele (Sol panel ve Profil İçin)
app.get('/friends/list', async (req, res) => {
    const { userId } = req.query;
    const { data: friendships } = await supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);

    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: bgs } = await supabase.from('user_backgrounds').select('*');

    const friends = friendships.map(f => {
        const friendId = f.requester_id === userId ? f.receiver_id : f.requester_id;
        const p = profiles.find(pr => pr.user_id === friendId);
        const bg = bgs.find(b => b.user_id === friendId);
        const name = p?.email ? p.email.split('@')[0] : `User ${p?.id}`;
        return {
            shortId: p?.id,
            userId: friendId,
            name: name,
            avatarUrl: bg?.avatar_url || `https://api.dicebear.com/9.x/lorelei/svg?seed=${name}&backgroundColor=72c7ff`
        };
    });
    res.json(friends);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));