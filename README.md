# MLBB Draft Studio

Aplikasi **draft pick + scoreboard** untuk Mobile Legends: Bang Bang, dirancang sebagai
sumber video *Browser Source* di OBS. Control panel dipakai operator, sedangkan dua
halaman overlay transparan ditampilkan ke penonton secara real-time.

- **Frontend:** React 18 + Vite + Tailwind CSS v4 + Framer Motion
- **Backend:** Express + Socket.IO (state server otoritatif, disimpan ke JSON)
- **Bahasa antarmuka:** Indonesia

---

## 1. Menjalankan

```bash
npm install
npm run dev          # server (5174) + Vite (5173) bersamaan
```

Mode produksi (satu port, tanpa Vite):

```bash
npm run build        # hasil di dist/
npm run start        # http://127.0.0.1:5174
```

### URL

| Halaman | Mode dev | Mode produksi |
|---|---|---|
| Control panel (operator) | `http://localhost:5173/control` | `http://127.0.0.1:5174/control` |
| Draft overlay (OBS) | `http://localhost:5173/overlay/draft` | `http://127.0.0.1:5174/overlay/draft` |
| Scoreboard overlay (OBS) | `http://localhost:5173/overlay/score` | `http://127.0.0.1:5174/overlay/score` |

Root `/` dialihkan ke `/control`. Route yang tidak dikenal menampilkan halaman 404.

### Environment variable

Semua bersifat opsional — tanpa variabel apa pun aplikasi berjalan persis seperti
panduan di atas (hanya bisa diakses dari mesin yang sama).

| Variabel | Default | Fungsi |
|---|---|---|
| `HOST` | `127.0.0.1` | Alamat bind. Ganti `0.0.0.0` untuk membuka akses LAN. |
| `PORT` / `SERVER_PORT` | `5174` | Port HTTP backend. |
| `CLIENT_ORIGIN` | *(kosong = semua)* | Daftar origin yang diizinkan, dipisah koma. Kosong = mode lokal/LAN tepercaya. |
| `APP_AUTH_TOKEN` | *(kosong = nonaktif)* | Bila diisi, semua aksi operator wajib menyertakan token ini. |
| `DATA_DIR` | `server/data` | Lokasi state, match, backup, dan logo yang diunggah. |
| `BACKUP_KEEP` | `20` | Jumlah file backup yang disimpan (retensi otomatis). |
| `BACKUP_INTERVAL_MS` | `30000` | Jarak minimum antar backup otomatis. |
| `VITE_HOST` | `127.0.0.1` | Host dev Vite (`0.0.0.0` bila control panel dibuka dari PC lain). |
| `VITE_PORT` | `5173` | Port dev Vite. |

Datasets statis (hero, skill, build, emblem, spell) selalu dibaca dari paket data
bawaan; `DATA_DIR` hanya untuk data yang berubah (state, match, backup, logo).

---

## 2. Fitur

### Control panel (`/control`)

- **Draft engine** berbasis urutan aksi (preset): pick, ban, giliran biru/merah,
  pola ular, penanda hero sudah terpakai (tidak bisa dipick dua kali kecuali
  `allowDuplicates`), undo, **kunci pilihan** (butuh konfirmasi untuk di-undo), reset.
- **Preset** dapat diganti dan disunting urutannya lewat UI (bukan aturan resmi MPL —
  murni konfigurasi turnamen).
- **Countdown otoritatif di server**: `start / pause / toggle / reset / setDuration /
  add`, sinkron antar klien lewat `deadlineAt` + `serverNow`, tidak pernah negatif,
  dan menghitung mundur walaupun tab overlay tidak fokus.
- **Panel tim**: nama, logo (unggah ke penyimpanan lokal server atau tempel URL),
  5 nickname pemain per sisi. Logo rusak otomatis diganti monogram sisi.
- **Panel skor manual**: kill, gold, turret, lord, turtle, durasi, status, MVP,
  pemenang game, tombol umumkan pemenang, serta **tombol "Game berikutnya"**
  (berkonfirmasi) yang menaikkan nomor game, me-reset skor per-game, dan membuat
  draft baru tanpa menyentuh nama tim/turnamen.
- **Panel overlay**: layout draft (`full / compact / lineup`), layout scoreboard
  (`full / compact`), durasi animasi, opsi tampil nama pemain/timer/tier/logo,
  dan **branding turnamen** (teks + logo, bisa diunggah).
- **Panel match**: simpan, muat ulang, dan hapus pertandingan (riwayat tersimpan di
  `server/data/matches/*.json`).
- **Panel riwayat**: log aksi dengan **label terstruktur** (`PICK`, `BAN`, `UNDO`,
  `RESET`, `PRESET`, `KUNCI`, `GAME`, `EMERGENCY`) + waktu + hero + sisi.
- **Indikator status di header**: stempel waktu autosave terakhir, jumlah backup
  tersimpan, jumlah overlay aktif, dan status koneksi (merah bila terputus).
- **Emergency stop**: tombol berkonfirmasi yang membekukan animasi overlay dan
  menghentikan countdown **tanpa menghapus data**; banner merah muncul di panel
  selama aktif. Dapat dilepas kapan saja.
- Pintasan: `Ctrl+Z` undo, `Ctrl+Enter` konfirmasi pick, `Ctrl+Shift+N` nickname,
  `Ctrl+Shift+T` countdown, `Ctrl+Shift+L` logo & nama tim (semua dihindari saat
  mengetik di input).
- Pencarian + filter hero (nama, role, lane, "hero bebas saja") dan lencana tier meta.

### Overlay draft (`/overlay/draft`)

- **full** (1920×1080): header skor turnamen, 5 slot per sisi + nama pemain, panel
  tengah (fase, sisi, countdown, aksi terakhir), baris ban di bawah.
- **compact**: versi ringkas.
- **lineup**: komposisi final kedua tim.
- **Branding turnamen** di kanan bawah (teks + logo sponsor) bila diaktifkan.
- **Peringatan waktu**: countdown berdenyut pada 5 detik terakhir dan merah pada 3
  detik terakhir; teks `WAKTU HABIS` menyala sesaat saat server mengirim
  `draft:timeout`.
- **Slot logo tim** memakai `TeamLogo` — URL rusak diganti monogram, bukan ikon
  "gambar rusak".
- **Animasi terhindar dari pemutaran ulang**: entrance (pick/ban/fase/layout)
  hanya berjalan saat benar-benar berubah, bukan setiap kali klien (re)tersambung;
  `prefers-reduced-motion` dihormati, dan seluruh animasi dibekukan selama
  emergency stop aktif.
- Tanpa kontrol admin, tanpa tombol, latar **transparan** (`background` body & html
  `rgba(0,0,0,0)`) sehingga aman ditumpuk di atas gameplay OBS.

### Scoreboard (`/overlay/score`)

- Kill besar, gold, turret, lord, turtle, seri (best-of), MVP, pemenang game,
  baris lineup hero + nickname.
- **Angka statistik bergerak naik/turun** saat nilai berubah, banner `VICTORY`
  + nama pemenang saat game selesai, dan header berganti mulus saat nomor game
  bertambah.
- Layout **compact** berupa lower-bar.

Kedua overlay menerima perubahan dari control panel **tanpa reload**.

---

## 3. Pipeline data

Semua aset dihasilkan oleh skrip, bukan dikerjakan manual:

```bash
npm run data:fetch     # unduh 133 hero + aset (portrait/avatar/splash/skill) dari API resmi Moonton
npm run data:import    # impor meta tier, equipment, emblem, build dari repo database
npm run data:validate  # validasi: struktur, nama hero cocok, file aset benar-benar ada
npm run data:all       # ketiganya berurutan
```

### Battle spell (opsional, impor manual)

Battle spell **tidak tersedia** di sumber data mana pun, sehingga datanya tidak
pernah direka-reka. Untuk memakainya, siapkan file JSON sesuai skema
`server/data/battle-spells.schema.json` lalu impor:

```bash
npm run data:battle-spells -- ./battle-spells.json   # impor + validasi
npm run data:battle-spells -- --check                # cek data tersimpan
```

Ketentuan:

- setiap spell **wajib** punya ikon nyata di `public/assets/spells/<id>.png|webp|jpg|jpeg`;
- ID hero/spell yang tidak dikenal **dibuang**, bukan ditebak;
- bila tidak ada satu pun entri valid, UI menampilkan catatan jujur
  "Data battle spell & ikon belum tersedia" — **tidak ada label/placeholder palsu**;
- setelah impor, restart server agar dataset dimuat ulang.

Hasil:

- `public/assets/{heroes,skills,items,fonts}` + `public/assets/manifest.json`
- `server/data/{heroes,hero-skills,meta-tiers,equipment,emblems,builds}.json`
- Laporan di `scripts/report/{fetch-report,import-report,validation-report}.json`

Status terakhir: **133 hero, 0 kegagalan unduh, 0 nama hero tidak cocok,
VALIDASI LULUS (0 error, 0 warning)**.

---

## 4. Pengujian

```bash
npm run test:server   # uji backend + kesiapan multi-PC (tanpa browser)
npm test              # E2E memakai browser sistem (Edge/Chrome) via puppeteer-core
npm run test:all      # keduanya berurutan
```

**Uji server** (`scripts/server-test.js`) meng-spawn proses server terpisah pada
port & `DATA_DIR` khusus (aman dijalankan bersamaan sesi dev) dan memeriksa 66
asersi: health/status autosave, skema battle spell, validasi & penyimpanan logo
(nama file dibuat server), penolakan Origin asing, token operator untuk REST &
socket, peran overlay **baca-saja**, field overlay baru (branding/emergency),
`match:nextGame`, autosave → restart → state pulih persis, `state.json` rusak →
pulih dari backup, retensi backup (`BACKUP_KEEP`), dan penulisan atomik (tanpa
sisa `.tmp`).

**E2E** (`scripts/e2e-test.js`) membuka halaman nyata dan memeriksa **70 asersi**:
kesiapan control panel, input turnamen/tim/roster, pick/undo/lock/reset, countdown
(jalan, jeda, durasi, `deadlineAt`), transparansi overlay, sinkronisasi real-time
tanpa reload, perubahan layout, simpan/muat pertandingan, route 404, indikator
autosave/backup, emergency stop (aktif + banner + log terstruktur), branding yang
benar-benar tampil di overlay, pintasan `Ctrl+Shift+N`, kejujuran data battle spell,
unggah logo, label riwayat, transisi game berikutnya, serta memastikan tidak ada
error console maupun request 4xx/5xx.

```bash
npm test                                  # terhadap dev server (5173)
BASE_URL=http://127.0.0.1:5174 npm test   # terhadap build produksi (bash)
# PowerShell: $env:BASE_URL='http://127.0.0.1:5174'; npm test
```

Keluaran: log PASS/FAIL, laporan JSON di `scripts/report/e2e-report.json`, dan
screenshot tiap layout di `scripts/report/*.png`.

---

## 5. Struktur proyek

```
mlbb-draft-studio/
├── index.html
├── vite.config.js            # port 5173, proxy /api & /socket.io → PORT (5174)
├── public/assets/            # hero, skill, item, font, manifest, logos/
├── server/
│   ├── index.js              # Express + Socket.IO + REST + keamanan + static + ticker
│   ├── draftEngine.js        # murni tanpa I/O: state machine draft, timer, nextGame, emergency
│   ├── presets.js            # preset urutan draft + validator
│   ├── store.js              # state aktif + jadwal autosave (wajah penyimpanan)
│   ├── storage.js            # lapisan file: tulis atomik, backup, pemulihan, DATA_DIR
│   └── data/                 # heroes, meta, equipment, emblems, builds,
│                             # battle-spells(.schema).json, state.json, matches/, backups/, logos/
├── scripts/
│   ├── fetch-hero-data.js
│   ├── import-database.js
│   ├── validate-data.js
│   ├── import-battle-spells.js   # impor manual battle spell + validasi skema
│   ├── server-test.js            # 66 asersi backend/multi-PC (tanpa browser)
│   └── e2e-test.js               # 70 asersi alur nyata via browser
└── src/
    ├── App.jsx  main.jsx  styles.css
    ├── lib/       store, socket, utils, data, overlay, anim
    ├── components/ ui, HeroImage, slots, HeroPicker, DraftBoard,
    │               TimerBar, sidepanels, Stage, TeamLogo, Branding
    └── pages/     Control, OverlayDraft, OverlayScore
```

---

## 6. API & event Socket.IO

### REST

`GET /api/health` · `GET /api/state` · `GET /api/heroes` (`?q=&role=&lane=`) ·
`GET /api/heroes/:id` · `GET /api/meta` · `GET /api/equipment` · `GET /api/emblems` ·
`GET /api/builds` · `GET /api/presets` · `GET /api/manifest` ·
`GET /api/battle-spells` ·
`GET|POST /api/matches` · `GET /api/matches/:id` · `POST /api/matches/:id/load` ·
`DELETE /api/matches/:id` ·
`POST /api/logos` (butuh token operator bila `APP_AUTH_TOKEN` di-set)

`/api/health` juga mengembalikan status `autosave` (`lastSaveAt`, `lastSaveOk`,
`backupCount`, `lastLoadedFrom`, `dirty`) serta `authRequired`.

### Klien → server (request/ack)

`draft:pick` · `draft:undo` · `draft:reset` · `draft:preset` · `draft:lock` ·
`draft:allowDuplicates` · `timer` · `team:update` · `meta:update` · `score:update` ·
`overlay:update` · `announce` · `match:save` · `match:load` · `match:delete` ·
`match:new` · **`match:nextGame`** · **`emergency`** · `state:request`

### Server → klien

`hello` (state + `serverNow` + presence + `authRequired` + `autosave`) ·
`state` (+ `autosave`) · `presence` · `clock` · `draft:timeout`

### Peran, token, dan validasi

- Klien menghubungkan dengan `?role=control` (panel operator) atau
  `?role=overlay` (OBS). **Klien overlay bersifat baca-saja** — setiap upaya
  mengubah draft/skor/overlay/timer ditolak server.
- Bila `APP_AUTH_TOKEN` di-set, klien `control` wajib mengirim token lewat
  handshake `auth` Socket.IO (bukan lewat URL); panel menampilkan gerbang token
  bila ditolak. REST memakai header `x-operator-token` / `Authorization: Bearer`.
- `Origin` lintas asal hanya diterima bila terdaftar di `CLIENT_ORIGIN`.
- Semua input divalidasi server: ID hero harus ada di dataset, logo harus
  `http/https`, `data:image/*`, atau path `/assets/…` milik aplikasi (tanpa `..`),
  teks dipotong pada panjang maksimum, angka dibatasi rentangnya.
- Unggah logo memverifikasi sihir byte gambar dan **nama file dibuat server**
  (`crypto.randomBytes`) sehingga path traversal tidak mungkin terjadi.

---

## 7. Autosave, backup & pemulihan

| Mekanisme | Detail |
|---|---|
| Autosave | Ditulis otomatis setelah perubahan (debounce 250 ms, **hanya bila revisi berubah**) ke `server/data/state.json`. |
| Penulisan atomik | File `.tmp` ditulis dulu lalu `rename` — proses yang mati mendadak tidak membuat state setengah rusak. |
| Indikator | Header control panel menampilkan `Autosave <jam>` (merah bila gagal) dan `Backup N`; detail di `GET /api/health` → `autosave`. |
| Backup berkala | Salinan `state.json` sebelum ditimpa → `server/data/backups/state-<timestamp>.json`, retensi `BACKUP_KEEP` (default 20). |
| Pemulihan otomatis | Saat `state.json` tidak valid/rusak, server memuat **backup terbaru yang valid** dan mencatatnya di log. |
| Restart | State aktif dimuat ulang persis seperti sebelum proses berhenti; timer yang masih berjalan dijeda agar tidak langsung kedaluwarsa. |
| Simpan manual | Panel **Match** → `server/data/matches/*.json` (simpan/muat/hapus), terpisah dari autosave. |
| Flush saat berhenti | `SIGINT`/`SIGTERM` melakukan flush penyimpanan terakhir. |

Restore manual: hentikan server → salin file pilihan dari `backups/` menjadi
`state.json` → nyalakan kembali. Bila file tetap rusak, biarkan saja: server akan
memilih backup terbaru yang valid secara otomatis.

---

## 8. Multi-PC, LAN & OBS

### Pola penggunaan

1. **Satu PC** — `npm run dev` (atau `build` + `start`), buka `/control`, tambahkan
   dua Browser Source OBS dengan URL yang sama.
2. **Dua PC (operator + siaran)** — PC operator menjalankan server + control panel;
   PC siaran cukup membuka URL overlay di OBS melalui LAN (tanpa instal apa pun).

### Langkah akses LAN

```bash
# di PC operator (contoh mode produksi)
npm run build
HOST=0.0.0.0 PORT=5174 APP_AUTH_TOKEN="rahasia-anda" npm run start
```

1. Cek IP LAN operator (`ipconfig`), misal `192.168.1.20`.
2. Izinkan port TCP `5174` di firewall Windows (jaringan privat/LAN saja).
3. PC lain membuka `http://192.168.1.20:5174/control` → **gerbang token** muncul →
   masukkan nilai `APP_AUTH_TOKEN`. Token disimpan di localStorage browser dan
   dikirim lewat handshake Socket.IO (tidak pernah lewat URL).
4. OBS → *Sources → Browser* → URL `http://192.168.1.20:5174/overlay/draft`
   (dan `/overlay/score`), Ukuran **1920×1080**, opsional aktifkan
   *"Refresh browser when scene becomes active"*.
5. Opsional: batasi asal permintaan dengan `CLIENT_ORIGIN=http://192.168.1.20:5174`.

Mode dev dari PC lain: `HOST=0.0.0.0 VITE_HOST=0.0.0.0 npm run dev` lalu buka
`http://<ip>:5173/control`.

### Catatan keamanan

- Default hanya `127.0.0.1` — tidak ada yang terbuka dari luar mesin.
- **Overlay selalu baca-saja**, termasuk bila tanpa token.
- Aksi operator (draft/skor/overlay/simpan-match/unggah logo) ditolak tanpa token
  bila `APP_AUTH_TOKEN` di-set.
- Proyek ini dirancang untuk LAN siaran: **jangan diekspos ke internet publik**
  (belum ada TLS, rate-limit, maupun manajemen akun).

---

## 9. Sumber data

| Sumber | Dipakai untuk | Lisensi |
|---|---|---|
| API resmi Moonton `api.gms.moontontech.com` (endpoint dari metode [`warungerik/MLBB-Hero-Scraper`](https://github.com/warungerik/MLBB-Hero-Scraper)) | 133 hero: role, lane, portrait/avatar/splash, skill + ikon | aset game © Moonton |
| [`Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang`](https://github.com/Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang) | tier meta draft, equipment, emblem, build | repo menyatakan MIT |
| [`p3hndrx/MLBB-API`](https://github.com/p3hndrx/MLBB-API) | direferensikan saja, tidak diintegrasikan | MIT |
| [`Draft_Pick_Web_version_v2`](https://github.com/) (proyek lokal) | font **Bebas Neue** (`public/assets/fonts/`, menyertakan `OFL.txt`) | OFL |

Ikon game, logo tim, dan gambar hero adalah aset berhak cipta Moonton — hanya
dipakai untuk keperluan siaran/pribadi.

---

## 10. Keterbatasan

- **Battle spell tidak tersedia** di sumber data mana pun; tidak ada yang direka-reka.
  Impor sendiri bila dibutuhkan lewat `npm run data:battle-spells -- <file.json>`
  (wajib menyertakan file ikon; tanpa ikon, UI tidak menampilkan apa pun).
- Urutan draft adalah **preset turnamen**, bukan aturan resmi MPL/contained esports.
- Skor (kill/gold/dst) diinput manual oleh operator, bukan ditarik dari game client.
- State aktif disimpan di file JSON: **satu proses server per `DATA_DIR`**.
  Banyak PC boleh mengendalikan/menonton lewat LAN, tetapi dua instance server tidak
  boleh menulis `state.json` yang sama secara bersamaan (jangan dijalankan dua kali
  dengan `DATA_DIR` yang sama).
- Logo tim/branding bisa berupa URL eksternal (bergantung jaringan siaran) atau
  unggahan lokal; gambar eksternal yang gagal dimuat otomatis diganti monogram.

---

## 11. Troubleshooting

- **"Backend tidak merespons"** → jalankan `npm run dev` (atau `npm run build && npm run start`).
- **Aset 404 di produksi** → pastikan `npm run build` dijalankan sebelum `npm run start`.
- **Overlay tidak menampilkan perubahan** → cek indikator "Server tersambung" dan
  jumlah "Overlay aktif" di header control panel; keduanya membaca socket yang sama.
- **"Token operator diperlukan"** / **"Token ditolak"** → server dijalankan dengan
  `APP_AUTH_TOKEN`; masukkan nilai yang sama, atau jalankan ulang tanpa variabel
  tersebut untuk mode lokal. Token tersimpan di localStorage browser.
- **PC lain tidak bisa membuka panel** → server harus `HOST=0.0.0.0` dan port
  diblokir firewall; gunakan `http://<ip-lan>:5174/control`.
- **Tampilan autosave merah / backup tidak bertambah** → cek izin tulis pada
  `DATA_DIR` (default `server/data`) dan lihat `GET /api/health` → `autosave`.
- **State terasa tidak lengkap setelah mati mendadak** → salin file terbaru dari
  `server/data/backups/` menjadi `state.json` (lihat bagian 7).
