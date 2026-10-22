const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors()); // Sitenin sunucuya bağlanmasına izin verir

// Dosya yükleme ayarı (Müzikleri geçici olarak hafızaya alır)
const upload = multer({ storage: multer.memoryStorage() });

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

// Yüklenen şarkıları listeleme yolu
app.get('/songs', async (req, res) => {
  const { data, error } = await supabase.from('songs').select('*').order('id', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Yeni müzik yükleme yolu
app.post('/upload', upload.single('music'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı' });

  try {
    const fileName = Date.now() + '-' + req.file.originalname.replace(/\s+/g, '-');
    
    // R2'ye Yükleme Komutu
    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    // Herkese açık dinleme linkini oluştur
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

    // Veritabanına Kaydet (Şarkı adı ve Link)
    const { data, error } = await supabase.from('songs').insert([
      { title: req.file.originalname, url: publicUrl }
    ]).select();

    if (error) throw error;
    res.json({ message: 'Şarkı başarıyla eklendi!', song: data[0] });

  } catch (err) {
    res.status(500).json({ error: 'Yükleme hatası: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));