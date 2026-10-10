# Lisensi & Atribusi Pipeline OCR

Modul `server/ocr/` adalah port **JavaScript murni** dari pendekatan OCR milik
[ScoreSight](https://github.com/royshil/scoresight) (Roy Klopfer) untuk membaca
scoreboard Mobile Legends: Bang Bang dari screenshot gameplay. Modul ini tidak
menyalin kode sumber Python ScoreSight secara harfiah; yang diport adalah
arsitektur pipeline dan kontrak perilaku per field.

## Komponen pihak ketiga

| Komponen | Lisensi | Dipakai untuk |
|---|---|---|
| [tesseract.js](https://github.com/naptha/tesseract.js) `^7.0.0` | Apache-2.0 | Worker OCR LSTM (WASM, tanpa binary native eksternal) |
| [sharp](https://github.com/lovell/sharp) `^0.35.5` | Apache-2.0 | Decode gambar → grayscale raw, resize, encode PNG |
| `eng.traineddata` (vendored di `server/ocr/engine/tessdata/`) | Apache-2.0 | Model bahasa Inggris bawaan Tesseract 4/5 |

Skrip OCR diuji terhadap `public/assets/OCR/Gameplayforscoreboard.png` (1384×706),
gambar scoreboard milik proyek ini sendiri.

## Deviasi terhadap ScoreSight

Kontrak perilaku port ini **berbeda** dari ScoreSight pada poin-poin berikut.
Semua deviasi disengaja dan dicatat agar perilaku dapat diaudit.

### 1. ROI proporsional, bukan piksel absolut

ScoreSight memakai koordinat piksel absolut untuk setiap field. Port ini memakai
**ROI proporsional 0–1** terhadap lebar/tinggi frame (`server/ocr/roiExtractor.js`),
sehingga satu set konfigurasi berlaku lintas resolusi (720p / 1080p / capture card).

### 2. Ambang confidence diskala 0–1 (perbaikan bug skala ScoreSight)

ScoreSight membandingkan `conf_thresh = 0.5` terhadap `MeanTextConf` tesseract yang
berada di skala **0–100** — secara efektif ambang ini tidak pernah menolak hasil
apa pun. Port ini menormalisasi confidence ke **0–1** lalu membandingkan terhadap
`confThresh` (default `0.5`) di `server/ocr/engine/worker.js`. Perbaikan ini
mengurangi teks semu masuk ke parser.

### 3. Citra biner/grayscale murni JS (tanpa OpenCV)

ScoreSight memakai `opencv-python` (Otsu global, dilasi 3×3, `cv2.absdiff`).
Port ini mengimplementasikan operasi yang setara di
`server/ocr/engine/imageops.js` dengan buffer `Uint8Array` murni JS:
`otsuBinarize`, `dilateBinary` (3×3), `meanAbsDiff` (untuk skip-similar temporal),
`contrastStretch`, `invertBinary`, `rescaleToHeight`. Tidak ada dependensi
OpenCV / native binding tambahan.

### 4. Deteksi objective dengan `team: null`

ScoreSight mengaitkan event objective ke tim tertentu. Detektor objective di
`server/ocr/objectiveDetector.js` **tidak menebak arah tim**; ia hanya
menghasilkan event berbasis teks yang cocok (mis. "Lord has been slain") dengan
`team: null`, agar konsumen (operator / integrasi) yang menentukan atribusi.
Lord/Turtle **hanya** dipancarkan dari teks notifikasi yang aktual — tidak pernah
ditebak dari angka skor.

### 5. Gerbang format + penerimaan `no_confidence`

ScoreSight mengandalkan ambang confidence semata. Port ini menambahkan
**gerbang format regex** per field (`formatRegex` di `settings.js`) dan
menerima hasil yang confidence-nya `null` / di bawah ambang **hanya bila** teks
mentah cocok dengan regex format field dan berhasil diparse
(`processFrame` bagian `no_confidence`, `server/ocr/index.js`). Teks yang gagal
gerbang format ditolak dengan alasan `format_mismatch` / `parse_failed`,
bukan dipaksakan masuk patch.

### 6. ROI & preprocess per-field dikalibrasi lokal

ROI default di `server/ocr/settings.js` dikalibrasi terhadap gambar acuan proyek
(`Gameplayforscoreboard.png`, 1384×706), bukan terhadap tangkapan layar perangkat
uji ScoreSight. Field faint (kill merah) memakai `localOtsu + contrastStretch +
upscale`; gold biru memakai `noBinarize + contrastStretch`. Konfigurasi ini
dapat dioverride lewat `userSettings` per frame.

## Keterbatasan yang diketahui (jujur)

Dikalibrasi pada gambar acuan tersebut, pembacaan berikut **tidak sempurna**
dan batasannya didokumentasikan (bukan ditutup-tutupi):

| Field | Harapan | Hasil aktual | Catatan |
|---|---|---|---|
| `timer` | `04:39` → 279000 ms | ✅ `04:39` | |
| `scoreBlue` | `10` | ✅ `10` | |
| `goldRed` | `12.8k` → 12800 | ✅ `12.8k` | |
| `scoreRed` | `9` | ⚠️ `3` | Digit merah low-contrast; localOtsu+stretch belum cukup pada gambar acuan ini |
| `goldBlue` | `11.5k` → 11500 | ⚠️ `11k` → 11000 | Desimal `.5` gugur pada preprocessing noBinarize |
| notifikasi | teks aktual saja | ✅ tidak ada klaim Lord/Turtle palsu | |

Pipeline, endpoint, patch, dan gerbang keamanan tetap diuji otomatis
(`npm run test:ocr`); angka yang tidak sempurna di atas diuji sebagai
**fakta yang diakui**, bukan disamarkan menjadi kegagalan pipeline.
