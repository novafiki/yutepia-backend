const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Maksimum tek dosya boyutu: 50 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const MAX_USER_QUOTA_BYTES = 50 * 1024 * 1024; // Kullanıcı başı 50 MB limit

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

// Türkçe karakter ve boşluk temizleyici yardımcı fonksiyon
function cleanFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ==========================================
// 1. KULLANICIYA ÖZEL ŞARKILARI VE KOTAYI GETİR
// ==========================================
app.get('/songs', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'Kullanıcı ID gerekli.' });
  }

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
    // Kullanıcının mevcut kullandığı alanı hesapla
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

    // Cloudflare R2'ye yükle
    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

    // Supabase veritabanına kaydet
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

    res.json({
      message: 'Şarkı başarıyla yüklendi!',
      song: data[0]
    });
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
    // Şarkıyı bul ve sahibini doğrula
    const { data: song, error: findErr } = await supabase
      .from('songs')
      .select('*')
      .eq('id', songId)
      .eq('user_id', userId)
      .single();

    if (findErr || !song) {
      return res.status(404).json({ error: 'Şarkı bulunamadı veya silme yetkiniz yok.' });
    }

    // Cloudflare R2'den dosyayı sil (Yer kaplamaması için)
    if (song.file_key) {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: song.file_key
      }));
    }

    // Supabase'den kaydı sil
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
// 4. KULLANICIYA ÖZEL ARKA PLAN GETİR VE YÜKLE
// ==========================================
app.get('/background', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.json({ bgUrl: null });

  const { data, error } = await supabase
    .from('user_backgrounds')
    .select('bg_url')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return res.json({ bgUrl: null });
  res.json({ bgUrl: data.bg_url });
});

app.post('/background', upload.single('background'), async (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(401).json({ error: 'Önce giriş yapmalısınız.' });
  if (!req.file) return res.status(400).json({ error: 'Resim dosyası seçilmedi.' });

  try {
    // Eski arka plan varsa R2'den sil (yer kaplamasın)
    const { data: oldBg } = await supabase
      .from('user_backgrounds')
      .select('file_key')
      .eq('user_id', userId)
      .maybeSingle();

    if (oldBg && oldBg.file_key) {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: oldBg.file_key
      })).catch(() => {});
    }

    const fileKey = `backgrounds/${userId}/${Date.now()}-${cleanFileName(req.file.originalname)}`;

    // Yeni arka planı R2'ye yükle
    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

    // Veritabanına kaydet (Upsert)
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));