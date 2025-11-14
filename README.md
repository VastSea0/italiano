# 🇮🇹 Italian Learning Platform

Modern ve modüler bir İtalyanca öğrenme platformu. Kelime analizi, frekans analizi ve interaktif öğrenme araçları içerir.

## 📁 Proje Yapısı

```
italiano/
├── 📄 HTML Dosyaları
│   ├── verb-analyzer.html      # Kelime tarayıcısı ve hikaye okuyucu
│   └── word-frequency.html     # Kelime frekans analizörü
│
├── 🎨 CSS Dosyaları
│   ├── styles.css              # Genel stiller
│   └── vocabulary-styles.css   # Kelime tarayıcı stilleri
│
├── ⚙️ JavaScript Dosyaları
│   ├── word-frequency-app.js   # Frekans analizörü uygulaması
│   ├── word-frequency-analyzer.js  # CLI frekans analizörü
│   └── verb-analyzer.js        # Kelime işleme araçları
│
├── 📊 Veri Dosyaları
│   ├── words.json             # Kelime veritabanı
│   └── story.json             # İnteraktif hikayeler
│
└── 🔧 Konfigürasyon
    ├── serve.js               # Web sunucusu
    └── package.json           # NPM konfigürasyonu
```

## 🚀 Kurulum ve Kullanım

### 🔐 Firebase Kurulumu

Yönetim paneli ve canlı veri senkronizasyonu için Firebase gereklidir. `/.env.local` dosyanıza aşağıdaki değişkenleri ekleyin:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_DATABASE_URL=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...

# Sunucu tarafı (Firebase Admin SDK)
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

> `FIREBASE_PRIVATE_KEY` değerinde satır sonlarını `\n` ile kaçışlamayı unutmayın. Admin SDK yalnızca Google Auth ile oturum açmış ve Firestore yetkisine sahip kullanıcıların veri güncellemesine izin verir.

### Web Uygulamasını Başlatma

```bash
npm start
# veya
npm run serve
```

Sunucu başladıktan sonra:
- **Kelime Tarayıcısı**: http://localhost:3000/
- **Frekans Analizörü**: http://localhost:3000/frequency

### Komut Satırı Araçları

#### Kelime Frekans Analizi (Metin Dosyası)

```bash
# TXT çıktısı
node word-frequency-analyzer.js input.txt output.txt

# JSON çıktısı
node word-frequency-analyzer.js input.txt output.json --json
```

#### NPM Script'leri

```bash
npm run word-frequency        # TXT formatında analiz
npm run word-frequency-json   # JSON formatında analiz
```

## 🌟 Özellikler

### 📚 Kelime Tarayıcısı (`verb-analyzer.html`)

- **Kategorilere Göre Kelime Tarama**: Fiiller, isimler, sıfatlar, zarflar, vb.
- **Gelişmiş Arama**: İtalyanca ve İngilizce arama
- **PDF Export**: Flashcard, tablo ve liste formatlarında
- **İnteraktif Hikaye Okuyucu**: Kelimelerin üzerine tıklayarak anlamlarını öğrenin
- **Kapsamlı İstatistikler**: Kelime dağılımı ve kapsama oranları

### 📊 Frekans Analizörü (`word-frequency.html`)

- **Metin Analizi**: İtalyanca metinlerdeki kelime sıklığını analiz edin
- **Kelime Birleştirme**: Artikelleri ve edatları otomatik birleştirir
- **Kelime Tanıma**: Veritabanınızdaki kelimelerle eşleştirir
- **İstatistiksel Raporlar**:
  - Toplam kelime sayısı
  - Benzersiz kelime sayısı
  - Bilinen/bilinmeyen kelime sayısı
  - Kelime dağarcığı kapsama oranı
- **Export Özellikleri**:
  - TXT formatında detaylı rapor
  - JSON formatında veri exportu
- **Filtreleme**: 
  - Bilinen kelimeleri vurgulama
  - Sadece bilinmeyen kelimeleri gösterme
- **Örnek Metin**: Test için hazır İtalyanca metin

## 📊 Veri Formatı

### words.json Yapısı

```json
{
  "mostCommonItalianVerbsA1": [...],
  "conjunctions": [...],
  "adjectives": [...],
  "adverbs": [...],
  "prepositions": [...],
  "timeExpressions": [...],
  "pronouns": [...],
  "commonNouns": [...]
}
```

### Frekans Analiz Çıktısı (JSON)

```json
{
  "analyzedAt": "2024-11-14T...",
  "statistics": {
    "totalWords": 150,
    "uniqueWords": 85,
    "knownWords": 65,
    "unknownWords": 20,
    "coverage": "76.5%"
  },
  "words": [
    {
      "rank": 1,
      "word": "il",
      "frequency": 12,
      "inVocabulary": true,
      "translation": "the",
      "type": "Conjunction"
    }
  ]
}
```

## 🎨 CSS Modülleri

- **styles.css**: Genel stiller (grid, butonlar, formlar, tablolar)
- **vocabulary-styles.css**: Kelime tarayıcı özel stilleri (kartlar, modaller, hikaye okuyucu)

## 🔧 Teknik Detaylar

### Kelime İşleme Algoritması

- Artikelleri isimlerle birleştirir (`il cane`, `la casa`)
- Edatlı artikelleri tanır (`del`, `alla`, `nel`)
- Noktalama işaretlerini temizler
- Sayıları filtreler
- Büyük/küçük harf duyarsız arama

### Desteklenen Tarayıcılar

- Chrome/Edge (önerilen)
- Firefox
- Safari
- Opera

## 📝 Lisans

ISC

## 👥 Katkıda Bulunma

Pull request'ler memnuniyetle karşılanır!

## 🐛 Sorun Bildirme

GitHub Issues: https://github.com/VastSea0/italiano/issues

---

**Not**: Bu proje A1-B1 seviyesi İtalyanca öğrenimi için tasarlanmıştır.
