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
const chatBgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const voiceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const MAX_USER_QUOTA_BYTES = 50 * 1024 * 1024;
const MAX_CHAT_BG_BYTES = 10 * 1024 * 1024; // 10 MB

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY, secretAccessKey: process.env.R2_SECRET_KEY }
});

function cleanFileName(name) { return (name || 'dosya').replace(/[^a-zA-Z0-9._-]/g, '_'); }

// MÜZİKLERİ GETİR
app.get('/songs', async (req, res) => {
  const { userId } = req.query; if (!userId) return res.status(400).json({ error: 'Gerekli.' });
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  const totalBytes = data.reduce((acc, item) => acc + (Number(item.file_size) || 0), 0);
  res.json({ songs: data, totalBytes, maxBytes: MAX_USER_QUOTA_BYTES });
});

// MÜZİK YÜKLE
app.post('/upload', upload.single('music'), async (req, res) => {
  const userId = req.body.userId; if (!userId || !req.file) return res.status(400).json({ error: 'Hata' });
  try {
    const { data: existingSongs } = await supabase.from('songs').select('file_size, sort_order').eq('user_id', userId);
    const usedBytes = (existingSongs || []).reduce((acc, s) => acc + (Number(s.file_size) || 0), 0);
    if (usedBytes + req.file.size > MAX_USER_QUOTA_BYTES) return res.status(400).json({ error: '50 MB limit doldu!' });

    const maxOrder = (existingSongs && existingSongs.length > 0)
      ? Math.max(...existingSongs.map(s => Number(s.sort_order) || 0)) + 1
      : 0;

    const fileKey = `music/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: fileKey, Body: req.file.buffer, ContentType: req.file.mimetype }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

    const { data, error } = await supabase
      .from('songs')
      .insert([{ title: req.file.originalname, url: publicUrl, user_id: userId, file_key: fileKey, file_size: req.file.size, sort_order: maxOrder }])
      .select();
    if (error) throw error;
    res.json({ message: 'Yüklendi!', song: data[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// MÜZİKLERİN SIRASINI DEĞİŞTİR
app.post('/songs/reorder', async (req, res) => {
  const { userId, orderedIds } = req.body;
  if (!userId || !Array.isArray(orderedIds)) return res.status(400).json({ error: 'Geçersiz veri.' });
  try {
    await Promise.all(
      orderedIds.map((songId, index) =>
        supabase.from('songs').update({ sort_order: index }).eq('id', songId).eq('user_id', userId)
      )
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MÜZİK SİL
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

// KULLANICI PROFİL VE TEMA AYARLARI
app.get('/profile-settings', async (req, res) => {
  const { userId } = req.query; if (!userId) return res.json({});
  const { data } = await supabase.from('user_backgrounds').select('*').eq('user_id', userId).maybeSingle();
  const { data: prof } = await supabase.from('profiles').select('display_name, id, bio').eq('user_id', userId).maybeSingle();
  res.json({
    displayName: prof?.display_name || null,
    profileId: prof?.id || null,
    bio: prof?.bio || '',
    bgUrl: data?.bg_url || null,
    chatBgUrl: data?.chat_bg_url || null,
    avatarUrl: data?.avatar_url || null,
    panelColor: data?.panel_color || '#73c8fa',
    panelOpacity: data?.panel_opacity !== null && data?.panel_opacity !== undefined ? Number(data.panel_opacity) : 0.48,
    bgOpacity: data?.bg_opacity !== null && data?.bg_opacity !== undefined ? Number(data.bg_opacity) : 1.0,
    bgBlur: data?.bg_blur !== null && data?.bg_blur !== undefined ? Number(data.bg_blur) : 0,
    autoPlay: data?.auto_play === true
  });
});

// HAKKINDA (BIO) GÜNCELLEME
app.post('/profile/bio', async (req, res) => {
  const { userId, bio } = req.body;
  if (!userId) return res.status(400).json({ error: 'Yetkisiz işlem.' });
  const cleanBio = (bio || '').trim().slice(0, 300);
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ bio: cleanBio || 'Henüz bir hakkında yazısı eklenmemiş.' })
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ success: true, bio: cleanBio || 'Henüz bir hakkında yazısı eklenmemiş.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BENZERSİZ KULLANICI ADI GÜNCELLEME
app.post('/username', async (req, res) => {
  const { userId, username } = req.body;
  if (!userId || !username) return res.status(400).json({ error: 'Kullanıcı adı boş olamaz.' });

  const cleanName = username.trim();
  if (cleanName.length < 3 || cleanName.length > 20) {
    return res.status(400).json({ error: 'Kullanıcı adı 3 ile 20 karakter arasında olmalıdır.' });
  }

  try {
    const { data: existing } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .ilike('display_name', cleanName);

    const isTaken = existing && existing.some(p => p.user_id !== userId && p.display_name.toLowerCase() === cleanName.toLowerCase());
    if (isTaken) {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten başkası tarafından alınmış!' });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: cleanName })
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true, displayName: cleanName });
  } catch (err) {
    res.status(500).json({ error: 'Kullanıcı adı güncellenemedi: ' + err.message });
  }
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

// TEMA, ARKA PLAN OPAKLIĞI, BLUR VE OTOMATİK MÜZİK KAYDETME
app.post('/theme', async (req, res) => {
  const { userId, panelColor, panelOpacity, bgOpacity, bgBlur, autoPlay } = req.body;
  if (!userId) return res.status(401).json({ error: 'Yetkisiz' });

  const updatePayload = {
    user_id: userId,
    panel_color: panelColor || '#73c8fa',
    panel_opacity: panelOpacity !== undefined && panelOpacity !== null ? Number(panelOpacity) : 0.48,
    bg_opacity: bgOpacity !== undefined && bgOpacity !== null ? Number(bgOpacity) : 1.0,
    bg_blur: bgBlur !== undefined && bgBlur !== null ? Number(bgBlur) : 0
  };

  if (autoPlay !== undefined) {
    updatePayload.auto_play = Boolean(autoPlay);
  }

  const { error } = await supabase.from('user_backgrounds').upsert(updatePayload, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get('/my-profile-id', async (req, res) => {
  const { userId } = req.query; if (!userId) return res.status(400).json({ error: 'Gerekli' });
  const { data, error } = await supabase.from('profiles').select('id, display_name').eq('user_id', userId).single();
  if (error || !data) return res.status(404).json({ error: 'Bulunamadı' });
  res.json({ profileId: data.id, displayName: data.display_name });
});

// ZİYARET EDİLEN PROFİL VERİLERİ (Hakkında / Bio ile birlikte)
app.get('/user-profile/:id', async (req, res) => {
  const shortId = req.params.id;
  const viewerId = req.query.viewerId;

  const { data: profile } = await supabase.from('profiles').select('user_id, display_name, created_at, bio').eq('id', shortId).single();
  if (!profile) return res.status(404).json({ error: 'Bulunamadı' });
  const realUserId = profile.user_id;
  const { data: settings } = await supabase.from('user_backgrounds').select('*').eq('user_id', realUserId).maybeSingle();
  const { data: songs } = await supabase
    .from('songs')
    .select('id, title, url, file_size, sort_order')
    .eq('user_id', realUserId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  let friendshipStatus = 'none';
  let viewerAutoPlay = false;

  if (viewerId) {
    const { data: viewerSettings } = await supabase.from('user_backgrounds').select('auto_play').eq('user_id', viewerId).maybeSingle();
    viewerAutoPlay = viewerSettings?.auto_play === true;

    if (viewerId !== realUserId) {
      const { data: f1 } = await supabase.from('friendships').select('status').eq('sender_id', viewerId).eq('receiver_id', realUserId).maybeSingle();
      const { data: f2 } = await supabase.from('friendships').select('status').eq('sender_id', realUserId).eq('receiver_id', viewerId).maybeSingle();
      const rel = f1 || f2;
      if (rel && rel.status) {
        friendshipStatus = rel.status;
      }
    }
  }

  res.json({
    realUserId,
    displayName: profile.display_name,
    createdAt: profile.created_at,
    bio: profile.bio || 'Henüz bir hakkında yazısı eklenmemiş.',
    friendshipStatus,
    viewerAutoPlay,
    ownerAutoPlay: settings?.auto_play === true,
    avatarUrl: settings?.avatar_url || `https://api.dicebear.com/9.x/lorelei/svg?seed=${profile.display_name || 'Anon'}&backgroundColor=72c7ff`,
    bgUrl: settings?.bg_url || '/arkaplan.jpg',
    panelColor: settings?.panel_color || '#73c8fa',
    panelOpacity: settings?.panel_opacity !== null && settings?.panel_opacity !== undefined ? Number(settings.panel_opacity) : 0.48,
    bgOpacity: settings?.bg_opacity !== null && settings?.bg_opacity !== undefined ? Number(settings.bg_opacity) : 1.0,
    bgBlur: settings?.bg_blur !== null && settings?.bg_blur !== undefined ? Number(settings.bg_blur) : 0,
    songs: songs || []
  });
});

// ==========================================
// ARKADAŞLIK VE AKTİFLİK SİSTEMİ
// ==========================================
app.post('/ping', async (req, res) => {
    const { userId, defaultName } = req.body;
    if(!userId) return res.json({success:false});

    const { data: existingProf } = await supabase.from('profiles').select('display_name').eq('user_id', userId).maybeSingle();
    const updateObj = { last_seen: new Date().toISOString() };
    if (!existingProf?.display_name && defaultName) {
        updateObj.display_name = defaultName;
    }

    await supabase.from('profiles').update(updateObj).eq('user_id', userId);
    res.json({success:true});
});

app.post('/logout', async (req, res) => {
    const { userId } = req.body; if(!userId) return res.json({success:false});
    const pastDate = new Date(Date.now() - 10 * 60000).toISOString();
    await supabase.from('profiles').update({ last_seen: pastDate }).eq('user_id', userId);
    res.json({success:true});
});

app.get('/online-users', async (req, res) => {
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

app.post('/friends/remove', async (req, res) => {
    const { userId, friendId } = req.body;
    if (!userId || !friendId) return res.status(400).json({ error: 'Eksik bilgi.' });
    try {
        await supabase.from('friendships').delete().eq('sender_id', userId).eq('receiver_id', friendId);
        await supabase.from('friendships').delete().eq('sender_id', friendId).eq('receiver_id', userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

// ARKADAŞ LİSTESİ (Son mesajlaşma zamanı ve okunmamış mesaj sayısıyla birlikte)
app.get('/friends/:userId', async (req, res) => {
    const { userId } = req.params;
    const { data } = await supabase.from('friendships').select('*').eq('status', 'accepted').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    if(!data || data.length === 0) return res.json([]);
    const friendIds = data.map(d => d.sender_id === userId ? d.receiver_id : d.sender_id);
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, id, last_seen').in('user_id', friendIds);
    const { data: bgs } = await supabase.from('user_backgrounds').select('user_id, avatar_url').in('user_id', friendIds);
    
    const { data: recentMsgs } = await supabase
      .from('messages')
      .select('sender_id, receiver_id, created_at, is_read')
      .is('group_id', null)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    const lastMsgMap = {};
    const unreadFromMap = {};
    if (recentMsgs) {
      for (const m of recentMsgs) {
        const otherId = m.sender_id === userId ? m.receiver_id : m.sender_id;
        if (otherId && !lastMsgMap[otherId]) {
          lastMsgMap[otherId] = m.created_at;
        }
        if (m.receiver_id === userId && m.is_read === false) {
          unreadFromMap[m.sender_id] = (unreadFromMap[m.sender_id] || 0) + 1;
        }
      }
    }

    const twoMinsAgo = new Date(Date.now() - 2 * 60000).toISOString();
    
    const result = friendIds.map(fid => {
        const prof = profiles?.find(p => p.user_id === fid);
        const bg = bgs?.find(b => b.user_id === fid);
        if(!prof) return null;
        return {
          user_id: fid,
          profile_id: prof.id,
          display_name: prof.display_name || 'Üye',
          avatar_url: bg?.avatar_url || `https://api.dicebear.com/9.x/lorelei/svg?seed=${prof.display_name}&backgroundColor=72c7ff`,
          is_online: prof.last_seen > twoMinsAgo,
          last_message_at: lastMsgMap[fid] || null,
          unread_count: unreadFromMap[fid] || 0
        };
    }).filter(Boolean);
    res.json(result);
});

// ==========================================
// SOHBET (CHAT), GRUP SOHBETİ VE SESLİ MESAJ SİSTEMİ
// ==========================================

// OKUNMAMIŞ MESAJ SAYISI (Chat butonu kırmızı bildirim yuvarlağı için)
app.get('/chat/unread/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.json({ unreadCount: 0 });
  try {
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('is_read', false);
    res.json({ unreadCount: count || 0 });
  } catch (err) {
    res.json({ unreadCount: 0 });
  }
});

// MESAJLARI OKUNDU İŞARETLE
app.post('/chat/mark-read', async (req, res) => {
  const { readerId, senderId } = req.body;
  if (!readerId || !senderId) return res.json({ success: false });
  try {
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', readerId)
      .eq('sender_id', senderId)
      .eq('is_read', false);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// GRUP OLUŞTURMA
app.post('/chat/groups/create', async (req, res) => {
  const { name, creatorId, memberIds } = req.body;
  if (!name || !creatorId) return res.status(400).json({ error: 'Grup adı gerekli.' });

  const cleanName = name.trim().slice(0, 35);
  const avatarUrl = `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(cleanName)}&backgroundColor=72c7ff`;

  try {
    const { data: group, error: gErr } = await supabase
      .from('chat_groups')
      .insert([{ name: cleanName, avatar_url: avatarUrl, created_by: creatorId }])
      .select()
      .single();
    if (gErr) throw gErr;

    const allMembers = Array.from(new Set([creatorId, ...(Array.isArray(memberIds) ? memberIds : [])]));
    const memberRows = allMembers.map(uid => ({ group_id: group.id, user_id: uid }));
    await supabase.from('chat_group_members').insert(memberRows);

    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// KULLANICININ GRUPLARINI GETİR
app.get('/chat/groups/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.json([]);
  try {
    const { data: memberships } = await supabase
      .from('chat_group_members')
      .select('group_id')
      .eq('user_id', userId);

    if (!memberships || memberships.length === 0) return res.json([]);
    const groupIds = memberships.map(m => m.group_id);

    const { data: groups } = await supabase
      .from('chat_groups')
      .select('*')
      .in('id', groupIds);

    const { data: allMembers } = await supabase
      .from('chat_group_members')
      .select('group_id, user_id')
      .in('group_id', groupIds);

    const { data: recentGroupMsgs } = await supabase
      .from('messages')
      .select('group_id, created_at')
      .in('group_id', groupIds)
      .order('created_at', { ascending: false });

    const lastGroupMsgMap = {};
    if (recentGroupMsgs) {
      for (const gm of recentGroupMsgs) {
        if (gm.group_id && !lastGroupMsgMap[gm.group_id]) {
          lastGroupMsgMap[gm.group_id] = gm.created_at;
        }
      }
    }

    const result = (groups || []).map(g => {
      const mCount = (allMembers || []).filter(m => m.group_id === g.id).length;
      return {
        ...g,
        member_count: mCount,
        last_message_at: lastGroupMsgMap[g.id] || g.created_at
      };
    });

    result.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
    res.json(result);
  } catch (err) {
    res.json([]);
  }
});

// 1. İki kullanıcı arasındaki mesajları getir
app.get('/chat/messages', async (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'Eksik bilgi.' });

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .is('group_id', null)
    .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// 2. Grup mesajlarını getir (Gönderen isimleriyle birlikte)
app.get('/chat/group-messages', async (req, res) => {
  const { groupId } = req.query;
  if (!groupId) return res.status(400).json({ error: 'Grup ID gerekli.' });

  try {
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const senderIds = Array.from(new Set((msgs || []).map(m => m.sender_id)));
    let nameMap = {};
    if (senderIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', senderIds);
      (profs || []).forEach(p => { nameMap[p.user_id] = p.display_name; });
    }

    const enriched = (msgs || []).map(m => ({
      ...m,
      sender_name: nameMap[m.sender_id] || 'Üye'
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Sesli mesaj yükleme (Mikrofondan kaydedilen ses)
app.post('/chat/upload-voice', voiceUpload.single('voice'), async (req, res) => {
  const { senderId } = req.body;
  if (!senderId || !req.file) return res.status(400).json({ error: 'Ses kaydı bulunamadı.' });

  try {
    const fileKey = `chat_voice/${senderId}/${Date.now()}-sesli_mesaj.webm`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || 'audio/webm'
    }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;
    res.json({
      publicUrl,
      fileKey,
      fileName: 'Sesli Mesaj',
      fileSize: req.file.size
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Sohbete veya Gruba mesaj / GIF / Sesli Mesaj gönder
app.post('/chat/send', async (req, res) => {
  const {
    senderId,
    receiverId,
    groupId,
    content,
    attachmentUrl,
    attachmentKey,
    attachmentName,
    attachmentType,
    attachmentSize
  } = req.body;

  if (!senderId || (!receiverId && !groupId)) {
    return res.status(400).json({ error: 'Gönderici veya alıcı/grup eksik.' });
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([{
        sender_id: senderId,
        receiver_id: groupId ? null : receiverId,
        group_id: groupId ? Number(groupId) : null,
        content: content || '',
        attachment_url: attachmentUrl || null,
        attachment_key: attachmentKey || null,
        attachment_name: attachmentName || null,
        attachment_type: attachmentType || null,
        attachment_size: Number(attachmentSize) || 0,
        is_large_file: false,
        expires_at: null,
        is_expired_deleted: false,
        is_pinned: false,
        is_read: false
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, message: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Mesaj Sabitle / Sabitlemeyi Kaldır
app.post('/chat/pin', async (req, res) => {
  const { messageId, isPinned } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Mesaj ID gerekli.' });

  try {
    const { data, error } = await supabase
      .from('messages')
      .update({ is_pinned: Boolean(isPinned) })
      .eq('id', messageId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, message: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Sohbet Arka Planı Yükle (Resim veya GIF - Maksimum 10 MB)
app.post('/chat/background', (req, res) => {
  chatBgUpload.single('chatBg')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Sohbet arka planı maksimum 10 MB olabilir!' });
      }
      return res.status(400).json({ error: err.message });
    }

    const userId = req.body.userId;
    if (!userId || !req.file) return res.status(400).json({ error: 'Dosya seçilmedi.' });
    if (req.file.size > MAX_CHAT_BG_BYTES) {
      return res.status(400).json({ error: 'Sohbet arka planı maksimum 10 MB olabilir!' });
    }

    try {
      const { data: oldData } = await supabase.from('user_backgrounds').select('chat_bg_key').eq('user_id', userId).maybeSingle();
      if (oldData && oldData.chat_bg_key) {
        await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: oldData.chat_bg_key })).catch(() => {});
      }

      const fileKey = `chat_backgrounds/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;
      await s3.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      }));
      const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

      await supabase.from('user_backgrounds').upsert({
        user_id: userId,
        chat_bg_url: publicUrl,
        chat_bg_key: fileKey
      }, { onConflict: 'user_id' });

      res.json({ chatBgUrl: publicUrl });
    } catch (uploadErr) {
      res.status(500).json({ error: uploadErr.message });
    }
  });
});

// Sohbet arka planını sıfırla
app.post('/chat/background/reset', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Yetkisiz' });
  try {
    const { data: oldData } = await supabase.from('user_backgrounds').select('chat_bg_key').eq('user_id', userId).maybeSingle();
    if (oldData && oldData.chat_bg_key) {
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: oldData.chat_bg_key })).catch(() => {});
    }
    await supabase.from('user_backgrounds').update({ chat_bg_url: null, chat_bg_key: null }).eq('user_id', userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));