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

app.get('/songs', async (req, res) => {
  const { userId } = req.query; if (!userId) return res.status(400).json({ error: 'Gerekli.' });
  const { data, error } = await supabase.from('songs').select('*').eq('user_id', userId).order('id', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  const totalBytes = data.reduce((acc, item) => acc + (Number(item.file_size) || 0), 0);
  res.json({ songs: data, totalBytes, maxBytes: MAX_USER_QUOTA_BYTES });
});

app.post('/upload', upload.single('music'), async (req, res) => {
  const userId = req.body.userId; if (!userId || !req.file) return res.status(400).json({ error: 'Hata' });
  try {
    const { data: existingSongs } = await supabase.from('songs').select('file_size').eq('user_id', userId);
    const usedBytes = existingSongs.reduce((acc, s) => acc + (Number(s.file_size) || 0), 0);
    if (usedBytes + req.file.size > MAX_USER_QUOTA_BYTES) return res.status(400).json({ error: '50 MB limit doldu!' });

    const fileKey = `music/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: fileKey, Body: req.file.buffer, ContentType: req.file.mimetype }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

    const { data, error } = await supabase.from('songs').insert([{ title: req.file.originalname, url: publicUrl, user_id: userId, file_key: fileKey, file_size: req.file.size }]).select();
    if (error) throw error; res.json({ message: 'Yüklendi!', song: data[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/songs/:id', async (req, res) => {
  const { id } = req.params; const { userId } = req.query; if (!userId) return res.status(401).json({ error: 'Yetkisiz' });
  try {
    const { data: song } = await supabase.from('songs').select('*').eq('id', id).eq('user_id', userId).single();
    if (!song) return res.status(404).json({ error: 'Bulunamadı' });
    if (song.file_key) await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: song.file_key }));
    await supabase.from('songs').delete().eq('id', id).eq('user_id', userId);
    res.json({ message: 'Silindi' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/profile-settings', async (req, res) => {
  const { userId } = req.query; if (!userId) return res.json({});
  const { data } = await supabase.from('user_backgrounds').select('*').eq('user_id', userId).maybeSingle();
  res.json({ bgUrl: data?.bg_url || null, avatarUrl: data?.avatar_url || null, panelColor: data?.panel_color || '#73c8fa', panelOpacity: data?.panel_opacity !== null ? data?.panel_opacity : 0.48 });
});

app.post('/background', upload.single('background'), async (req, res) => {
  const userId = req.body.userId; if (!userId || !req.file) return res.status(400).json({ error: 'Hata' });
  try {
    const { data: oldData } = await supabase.from('user_backgrounds').select('file_key').eq('user_id', userId).maybeSingle();
    if (oldData && oldData.file_key) await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: oldData.file_key })).catch(() => {});
    const fileKey = `backgrounds/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: fileKey, Body: req.file.buffer, ContentType: req.file.mimetype }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;
    await supabase.from('user_backgrounds').upsert({ user_id: userId, bg_url: publicUrl, file_key: fileKey }, { onConflict: 'user_id' });
    res.json({ bgUrl: publicUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/avatar', upload.single('avatar'), async (req, res) => {
  const userId = req.body.userId; if (!userId || !req.file) return res.status(400).json({ error: 'Hata' });
  try {
    const { data: oldData } = await supabase.from('user_backgrounds').select('avatar_key').eq('user_id', userId).maybeSingle();
    if (oldData && oldData.avatar_key) await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: oldData.avatar_key })).catch(() => {});
    const avatarKey = `avatars/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: avatarKey, Body: req.file.buffer, ContentType: req.file.mimetype }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${avatarKey}`;
    await supabase.from('user_backgrounds').upsert({ user_id: userId, avatar_url: publicUrl, avatar_key: avatarKey }, { onConflict: 'user_id' });
    res.json({ avatarUrl: publicUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/theme', async (req, res) => {
  const { userId, panelColor, panelOpacity } = req.body; if (!userId) return res.status(401).json({ error: 'Yetkisiz' });
  await supabase.from('user_backgrounds').upsert({ user_id: userId, panel_color: panelColor || '#73c8fa', panel_opacity: Number(panelOpacity) }, { onConflict: 'user_id' });
  res.json({ success: true });
});

app.get('/my-profile-id', async (req, res) => {
  const { userId } = req.query; if (!userId) return res.status(400).json({ error: 'Gerekli' });
  const { data, error } = await supabase.from('profiles').select('id').eq('user_id', userId).single();
  if (error || !data) return res.status(404).json({ error: 'Bulunamadı' });
  res.json({ profileId: data.id });
});

app.get('/user-profile/:id', async (req, res) => {
  const shortId = req.params.id; 
  const { data: profile } = await supabase.from('profiles').select('user_id, display_name').eq('id', shortId).single();
  if (!profile) return res.status(404).json({ error: 'Bulunamadı' });
  const realUserId = profile.user_id;
  const { data: settings } = await supabase.from('user_backgrounds').select('*').eq('user_id', realUserId).maybeSingle();
  const { data: songs } = await supabase.from('songs').select('id, title, url').eq('user_id', realUserId);
  res.json({ realUserId, displayName: profile.display_name, avatarUrl: settings?.avatar_url || 'https://api.dicebear.com/9.x/lorelei/svg?seed=Anon&backgroundColor=72c7ff', bgUrl: settings?.bg_url || '/arkaplan.jpg', panelColor: settings?.panel_color || '#73c8fa', panelOpacity: settings?.panel_opacity !== undefined ? settings?.panel_opacity : 0.48, songs: songs || [] });
});

// ==========================================
// ARKADAŞLIK VE AKTİFLİK SİSTEMİ
// ==========================================
app.post('/ping', async (req, res) => {
    const { userId, displayName } = req.body; if(!userId) return res.json({success:false});
    await supabase.from('profiles').update({ last_seen: new Date().toISOString(), display_name: displayName }).eq('user_id', userId);
    res.json({success:true});
});

// YENİ: ÇIKIŞ YAPILDIĞINDA ANINDA OFFLINE OLMAK İÇİN SİNYAL
app.post('/logout', async (req, res) => {
    const { userId } = req.body; if(!userId) return res.json({success:false});
    const pastDate = new Date(Date.now() - 10 * 60000).toISOString();
    await supabase.from('profiles').update({ last_seen: pastDate }).eq('user_id', userId);
    res.json({success:true});
});

app.get('/online-users', async (req, res) => {
    // 5 Dakika değil, artık 2 DAKİKA kuralı geçerli (Hemen offline düşer)
    const twoMinsAgo = new Date(Date.now() - 2 * 60000).toISOString();
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, id').gte('last_seen', twoMinsAgo);
    if(!profiles || profiles.length === 0) return res.json([]);
    const userIds = profiles.map(p => p.user_id);
    const { data: bgs } = await supabase.from('user_backgrounds').select('user_id, avatar_url').in('user_id', userIds);
    const result = profiles.map(p => { const bg = bgs?.find(b => b.user_id === p.user_id); return { ...p, avatar_url: bg?.avatar_url || `https://api.dicebear.com/9.x/lorelei/svg?seed=${p.display_name}&backgroundColor=72c7ff` }; });
    res.json(result);
});

app.post('/friends/request', async (req, res) => {
    const { senderId, receiverId } = req.body;
    if(!senderId || !receiverId) return res.status(400).json({error: 'Eksik bilgi.'});
    if(senderId === receiverId) return res.status(400).json({error: 'Kendinize istek gönderemezsiniz.'});
    
    const { data: ex1 } = await supabase.from('friendships').select('id, status').eq('sender_id', senderId).eq('receiver_id', receiverId);
    const { data: ex2 } = await supabase.from('friendships').select('id, status').eq('sender_id', receiverId).eq('receiver_id', senderId);
    const record = (ex1 && ex1.length > 0) ? ex1[0] : ((ex2 && ex2.length > 0) ? ex2[0] : null);
    
    if (record) {
        if (record.status === 'pending') return res.status(400).json({error: 'Zaten bekleyen bir istek var.'});
        if (record.status === 'accepted') return res.status(400).json({error: 'Zaten arkadaşsınız.'});
        if (record.status === 'rejected') await supabase.from('friendships').delete().eq('id', record.id);
    }
    
    const { error } = await supabase.from('friendships').insert({ sender_id: senderId, receiver_id: receiverId, status: 'pending' });
    if (error) return res.status(500).json({error: `DB Hatası: ${error.message}`});
    res.json({success: true});
});

app.get('/friends/requests/:userId', async (req, res) => {
    const { userId } = req.params;
    const { data, error } = await supabase.from('friendships').select('id, sender_id').eq('receiver_id', userId).eq('status', 'pending');
    if(error || !data || data.length === 0) return res.json([]);
    
    const senderIds = data.map(d => d.sender_id);
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', senderIds);
    const { data: bgs } = await supabase.from('user_backgrounds').select('user_id, avatar_url').in('user_id', senderIds);
    
    const result = data.map(req => {
        const prof = profiles?.find(p => p.user_id === req.sender_id);
        const bg = bgs?.find(b => b.user_id === req.sender_id);
        return { 
            id: req.id, sender_id: req.sender_id, display_name: prof?.display_name || 'Gizemli Üye', 
            avatar_url: bg?.avatar_url || `https://api.dicebear.com/9.x/lorelei/svg?seed=Anon&backgroundColor=72c7ff` 
        };
    });
    res.json(result);
});

app.post('/friends/respond', async (req, res) => {
    const { requestId, status } = req.body; 
    if (status === 'rejected') {
        const { error } = await supabase.from('friendships').delete().eq('id', requestId);
        if(error) return res.status(500).json({error: error.message});
    } else {
        const { error } = await supabase.from('friendships').update({status}).eq('id', requestId);
        if(error) return res.status(500).json({error: error.message});
    }
    res.json({success: true});
});

app.get('/friends/:userId', async (req, res) => {
    const { userId } = req.params;
    const { data } = await supabase.from('friendships').select('*').eq('status', 'accepted').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    if(!data || data.length === 0) return res.json([]);
    const friendIds = data.map(d => d.sender_id === userId ? d.receiver_id : d.sender_id);
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, id, last_seen').in('user_id', friendIds);
    const { data: bgs } = await supabase.from('user_backgrounds').select('user_id, avatar_url').in('user_id', friendIds);
    
    // Arkadaşlarda da süreyi 2 dakikaya çektik
    const twoMinsAgo = new Date(Date.now() - 2 * 60000).toISOString();
    
    const result = friendIds.map(fid => {
        const prof = profiles?.find(p => p.user_id === fid);
        const bg = bgs?.find(b => b.user_id === fid);
        if(!prof) return null;
        return { user_id: fid, profile_id: prof.id, display_name: prof.display_name || 'Üye', avatar_url: bg?.avatar_url || `https://api.dicebear.com/9.x/lorelei/svg?seed=${prof.display_name}&backgroundColor=72c7ff`, is_online: prof.last_seen > twoMinsAgo };
    }).filter(Boolean);
    res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));