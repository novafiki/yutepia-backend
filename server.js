const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Maksimum dosya boyutu: 50 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const MAX_USER_QUOTA_BYTES = 50 * 1024 * 1024; // 50 MB müzik kotası

// 1. Supabase Bağlantısı
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. Cloudflare R2 Bağlantısı
const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  }
});

function cleanFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ==========================================
// 1. KULLANICIYA ÖZEL ŞARKILARI VE KOTAYI GETİR
// ==========================================
app.get('/songs', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Kullanıcı ID gerekli.' });

  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const totalBytes = data.reduce((acc, item) => acc + (Number(item.file_size) || 0), 0);

  res.json({
    songs: data,
    totalBytes,
    maxBytes: MAX_USER_QUOTA_BYTES
  });
});

// ==========================================
// 2. KULLANICIYA ÖZEL MÜZİK YÜKLE (50 MB KOTALI)
// ==========================================
app.post('/upload', upload.single('music'), async (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(401).json({ error: 'Önce giriş yapmalısınız.' });
  if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı.' });

  try {
    const { data: existingSongs, error: fetchErr } = await supabase
      .from('songs')
      .select('file_size')
      .eq('user_id', userId);

    if (fetchErr) throw fetchErr;

    const usedBytes = existingSongs.reduce((acc, s) => acc + (Number(s.file_size) || 0), 0);
    if (usedBytes + req.file.size > MAX_USER_QUOTA_BYTES) {
      return res.status(400).json({
        error: '50 MB müzik depolama limitiniz doldu! Yeni şarkı yüklemek için mevcut şarkılarınızdan bazılarını silin.'
      });
    }

    const fileKey = `music/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

    const { data, error } = await supabase.from('songs').insert([
      {
        title: req.file.originalname,
        url: publicUrl,
        user_id: userId,
        file_key: fileKey,
        file_size: req.file.size
      }
    ]).select();

    if (error) throw error;

    res.json({ message: 'Şarkı başarıyla yüklendi!', song: data[0] });
  } catch (err) {
    res.status(500).json({ error: 'Yükleme hatası: ' + err.message });
  }
});

// ==========================================
// 3. ŞARKIYI HEM R2 SUNUCUSUNDAN HEM VERİTABANINDAN SİL
// ==========================================
app.delete('/songs/:id', async (req, res) => {
  const songId = req.params.id;
  const userId = req.query.userId;

  if (!userId) return res.status(401).json({ error: 'Yetkisiz işlem.' });

  try {
    const { data: song, error: findErr } = await supabase
      .from('songs')
      .select('*')
      .eq('id', songId)
      .eq('user_id', userId)
      .single();

    if (findErr || !song) {
      return res.status(404).json({ error: 'Şarkı bulunamadı veya silme yetkiniz yok.' });
    }

    if (song.file_key) {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: song.file_key
      }));
    }

    const { error: delErr } = await supabase
      .from('songs')
      .delete()
      .eq('id', songId)
      .eq('user_id', userId);

    if (delErr) throw delErr;

    res.json({ message: 'Şarkı sunucudan kalıcı olarak silindi.' });
  } catch (err) {
    res.status(500).json({ error: 'Silme hatası: ' + err.message });
  }
});

// ==========================================
// 4. KULLANICI PROFİL VE TEMA AYARLARINI GETİR
// ==========================================
app.get('/profile-settings', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.json({});

  const { data, error } = await supabase
    .from('user_backgrounds')
    .select('bg_url, avatar_url, panel_color, panel_opacity')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return res.json({
      bgUrl: null,
      avatarUrl: null,
      panelColor: '#73c8fa',
      panelOpacity: 0.48
    });
  }

  res.json({
    bgUrl: data.bg_url || null,
    avatarUrl: data.avatar_url || null,
    panelColor: data.panel_color || '#73c8fa',
    panelOpacity: data.panel_opacity !== null ? data.panel_opacity : 0.48
  });
});

// ==========================================
// 5. DUVAR KAĞIDI (WALLPAPER) YÜKLE
// ==========================================
app.post('/background', upload.single('background'), async (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(401).json({ error: 'Önce giriş yapmalısınız.' });
  if (!req.file) return res.status(400).json({ error: 'Resim dosyası seçilmedi.' });

  try {
    const { data: oldData } = await supabase
      .from('user_backgrounds')
      .select('file_key')
      .eq('user_id', userId)
      .maybeSingle();

    if (oldData && oldData.file_key) {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: oldData.file_key
      })).catch(() => {});
    }

    const fileKey = `backgrounds/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

    const { error: upsertErr } = await supabase
      .from('user_backgrounds')
      .upsert({
        user_id: userId,
        bg_url: publicUrl,
        file_key: fileKey
      }, { onConflict: 'user_id' });

    if (upsertErr) throw upsertErr;

    res.json({ message: 'Arka plan kaydedildi!', bgUrl: publicUrl });
  } catch (err) {
    res.status(500).json({ error: 'Arka plan yükleme hatası: ' + err.message });
  }
});

// ==========================================
// 6. PROFİL RESMİ (AVATAR) YÜKLE
// ==========================================
app.post('/avatar', upload.single('avatar'), async (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(401).json({ error: 'Önce giriş yapmalısınız.' });
  if (!req.file) return res.status(400).json({ error: 'Resim dosyası seçilmedi.' });

  try {
    const { data: oldData } = await supabase
      .from('user_backgrounds')
      .select('avatar_key')
      .eq('user_id', userId)
      .maybeSingle();

    if (oldData && oldData.avatar_key) {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: oldData.avatar_key
      })).catch(() => {});
    }

    const avatarKey = `avatars/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: avatarKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${avatarKey}`;

    const { error: upsertErr } = await supabase
      .from('user_backgrounds')
      .upsert({
        user_id: userId,
        avatar_url: publicUrl,
        avatar_key: avatarKey
      }, { onConflict: 'user_id' });

    if (upsertErr) throw upsertErr;

    res.json({ message: 'Profil resmi güncellendi!', avatarUrl: publicUrl });
  } catch (err) {
    res.status(500).json({ error: 'Profil resmi yükleme hatası: ' + err.message });
  }
});

// ==========================================
// 7. PANEL RENGİ VE OPAKLIĞINI KAYDET
// ==========================================
app.post('/theme', async (req, res) => {
  const { userId, panelColor, panelOpacity } = req.body;
  if (!userId) return res.status(401).json({ error: 'Önce giriş yapmalısınız.' });

  try {
    const { error } = await supabase
      .from('user_backgrounds')
      .upsert({
        user_id: userId,
        panel_color: panelColor || '#73c8fa',
        panel_opacity: Number(panelOpacity)
      }, { onConflict: 'user_id' });

    if (error) throw error;

    res.json({ message: 'Tema ayarları hesabına kaydedildi!' });
  } catch (err) {
    res.status(500).json({ error: 'Tema kaydetme hatası: ' + err.message });
  }
});

// ==========================================
// 8. O ANKİ KULLANICININ SIRALI (1, 2, 3) ID'SİNİ BULMA
// ==========================================
app.get('/my-profile-id', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Gerekli' });

  const { data, error } = await supabase.from('profiles').select('id').eq('user_id', userId).single();
  if (error || !data) return res.status(404).json({ error: 'Profil ID bulunamadı' });
  
  res.json({ profileId: data.id });
});

// ==========================================
// 9. ZİYARET EDİLEN PROFİLİN (Örn: /user/1) VERİLERİNİ GETİR
// ==========================================
app.get('/user-profile/:id', async (req, res) => {
  const shortId = req.params.id; 
  
  // 1 numaranın gerçek Supabase UUID'sini bul
  const { data: profile, error: profErr } = await supabase.from('profiles').select('user_id').eq('id', shortId).single();
  if (profErr || !profile) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

  const realUserId = profile.user_id;

  // O kullanıcıya ait tüm ayarları ve müzikleri çekip ziyaretçiye gönder
  const { data: settings } = await supabase.from('user_backgrounds').select('*').eq('user_id', realUserId).maybeSingle();
  const { data: songs } = await supabase.from('songs').select('id, title, url').eq('user_id', realUserId);

  res.json({
    avatarUrl: settings?.avatar_url || 'https://api.dicebear.com/9.x/lorelei/svg?seed=Anon&backgroundColor=72c7ff',
    bgUrl: settings?.bg_url || './arkaplan.jpg',
    panelColor: settings?.panel_color || '#73c8fa',
    panelOpacity: settings?.panel_opacity !== undefined ? settings?.panel_opacity : 0.48,
    songs: songs || []
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));