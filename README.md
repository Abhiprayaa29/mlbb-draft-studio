# MLBB Draft Studio

Aplikasi **draft pick + scoreboard** untuk Mobile Legends: Bang Bang, dirancang sebagai
sumber video *Browser Source* di OBS. Control panel dipakai operator, sedangkan
halaman overlay transparan (draft, scoreboard, dan **Sponsor Edition**)
ditampilkan ke penonton secara real-time.

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
| Sponsor Edition overlay (OBS) | `http://localhost:5173/overlay/templates/sponsor-edition` | `http://127.0.0.1:5174/overlay/templates/sponsor-edition` |

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
| `GRID_ENABLED` | `false` | Aktifkan integrasi data eksternal GRID (lihat bagian 10). |
| `GRID_API_KEY` / `GRID_GRAPHQL_URL` / `GRID_WS_URL` | *(kosong)* | Kredensial GRID — **hanya dibaca server**, tidak pernah ke browser/OBS/state. |
| `GRID_DATA_SOURCE` | `manual` | Sumber saat start: `manual` \| `grid` \| `fixture`. |
| `AUTOMATION_MODE` / `AUTOMATION_ENABLED` | `monitor` / `false` | Mode otomasi + gerbang kedua mode auto. |
| `OCR_OBS_WS_URL` / `OCR_OBS_WS_PASSWORD` / `OCR_OBS_SOURCE_NAME` | `ws://127.0.0.1:4455` / *(kosong)* / *(kosong)* | OBS WebSocket untuk capture gameplay → OCR (lihat bagian 11). Password hanya dibaca server. |
| `OCR_OBS_INTERVAL_MS` / `OCR_OBS_AUTO_START` | `1000` / `false` | Jeda antar frame & auto-start capture saat boot. |
| `SCORESIGHT_ENABLED` | `false` | Aktifkan ScoreSight file bridge (lihat bagian 11). |
| `SCORESIGHT_DIR` | *(kosong)* | Folder output ScoreSight — **hanya 9 file allowlist** dibaca (read-only). |
| `SCORESIGHT_POLL_INTERVAL_MS` | `500` | Jeda poll file ScoreSight. |
| `SCORESIGHT_HOME_SIDE` | *(kosong)* | `blue`\|`red` — pemetaan Home → sisi. Kosong = patch ditahan (`MAPPING_REQUIRED`). |
| `SCORESIGHT_GOLD_MODE` | `raw` | Satuan gold file: `raw` (integer/suffix-k apa adanya) atau `thousands` (integer `<1000` ×1000). |

Salin `.env.example` → `.env` lalu isi (`.env` tidak boleh masuk git — sudah
ditangani `.gitignore`). Tanpa kredensial, integrasi GRID live tidak tersedia
dan status jujur: **GRID LIVE CONNECTION NOT VERIFIED**.

Datasets statis (hero, skill, build, emblem, spell) selalu dibaca dari paket data
bawaan; `DATA_DIR` hanya untuk data yang berubah (state, match, backup, logo).

---

## 2. Fitur

### Control panel (`/control`)

- **Draft engine** berbasis urutan aksi (preset): pick, ban, giliran biru/merah,
  pola ular, penanda hero sudah terpakai (tidak bisa dipick dua kali kecuali
  `allowDuplicates`), undo, **kunci pilihan** (butuh konfirmasi untuk di-undo), reset.
  **Draft pick sepenuhnya manual** — tanpa countdown/timeout otomatis (UI countdown
  dan event `draft:timeout` dihapus; field legacy `deadlineAt` di state tidak lagi
  dipakai UI).
- **Preset** dapat diganti dan disunting urutannya lewat UI (bukan aturan resmi MPL —
  murni konfigurasi turnamen).
- **Timer pertandingan internal** (`matchTimer`, terpisah dari draft): start / pause /
  reset / set, sinkron antar klien lewat `elapsedMs` + `runningAt` + `serverNow`,
  tampil di panel Skor dan overlay. Sumber waktu bisa **manual** atau **ScoreSight
  `Time.txt`** (`timeSource`) — saat sumber aktif, tombol start manual ditolak
  agar **tidak ada dua timer berjalan bersamaan**; indikator `TIMER SOURCE`
  menampilkan sumber aktif.
- **Panel tim**: nama, logo (unggah ke penyimpanan lokal server atau tempel URL),
  5 nickname pemain per sisi. Logo rusak otomatis diganti monogram sisi.
- **Panel skor manual**: kill, gold (tampilan `fmtGold` Indonesia — `18,2k`,
  `9,6k`, `<1000` apa adanya), turret, lord, turtle, durasi, status, MVP,
  pemenang game, tombol umumkan pemenang, **kontrol timer pertandingan**
  (start/pause/reset/set + indikator `TIMER SOURCE`), serta **tombol "Game
  berikutnya"** (berkonfirmasi) yang menaikkan nomor game, me-reset skor
  per-game, dan membuat draft baru tanpa menyentuh nama tim/turnamen.
- **Panel overlay**: layout draft (`full / compact / lineup`), layout scoreboard
  (`full / compact`), durasi animasi, opsi tampil nama pemain/timer/tier/logo,
  dan **branding turnamen** (teks + logo, bisa diunggah).
- **Tab Tema (scoreboard)**: pilih preset (`rrq-gold`, `navy-tournament`,
  `modern-teal`, atau preset kustom buatan sendiri) lalu bebas menyunting —
  **live preview 16:9** di panel yang sama. Yang bisa diatur:
  - **Warna**: primary, secondary, accent, border, background, text, team A/B,
    highlight, timer (picker hex + palet cepat).
  - **Kerangka**: tebal garis (`borderPx`), skala hiasan (pita & sudut `deco`),
    skala teks, kapitalisasi label.
  - **Logo & sponsor**: logo turnamen (unggah/URL), posisi geser, skala,
    hingga 6 sponsor (unggah/URL) + nama sponsor, caster, teks info.
    **Manajemen sponsor** (unggah logo sponsor tersimpan di
    `server/data/sponsors/`) berada di panel tersedia dari tab Tema.
  - **Visibilitas** (13 sakelar): header, kerangka, logo turnamen, logo tim,
    sponsor, caster, info, skor, statistik, lineup, timer, MVP, pemenang.
  - Tombol **Simpan** mengirim sekaligus ke server (`overlay:update` → `theme`),
    **Batal** mengembalikan draft ke konfigurasi tersimpan, plus
    "Reset ke preset" & "Kembalikan default". Perubahan tema **tidak** memengaruhi
    skor/draft, dan skor tidak mengubah tema (diuji otomatis).
- **Panel match**: simpan, muat ulang, dan hapus pertandingan (riwayat tersimpan di
  `server/data/matches/*.json`).
- **Tab GRID (integrasi data)**: pilih sumber data `manual / grid / fixture`,
  mode otomasi `monitor / semi / auto`, sambungkan/putuskan feed, daftar pengajuan
  mode semi dengan tombol **Aktifkan/Tolak**, badge sumber draft & skor, waktu
  sinkron terakhir, ringkasan status koneksi + audit singkat. Panel **tidak pernah
  meminta API key** (credential hanya via environment server) dan selalu
  menyertakan catatan jujur `GRID LIVE CONNECTION NOT VERIFIED` (bagian 10).
- **Tab SCORESIGHT**: status bridge (aktif/mapping/9 file allowlist + dot status),
  tombol start/stop/refresh, pemetaan Home→Blue/Red, indikator sumber skor
  (`scoresight-files`) — **tanpa input credential di browser** (konfigurasi hanya
  via env server; lihat bagian 11).
- **Tab OBS OCR**: koneksi OBS WebSocket (status, pilih source, start/stop capture),
  kebijakan per-field OCR (`disabled` / `review` / `auto-apply`; `scoreRed` &
  `goldBlue` terkunci `review` untuk kalibrasi), tampilan reading terakhir.
- **Panel riwayat**: log aksi dengan **label terstruktur** (`PICK`, `BAN`, `UNDO`,
  `RESET`, `PRESET`, `KUNCI`, `GAME`, `EMERGENCY`) + waktu + hero + sisi.
- **Indikator status di header**: stempel waktu autosave terakhir, jumlah backup
  tersimpan, jumlah overlay aktif, dan status koneksi (merah bila terputus).
- **Emergency stop**: tombol berkonfirmasi yang membekukan animasi overlay dan
  menahan timer **tanpa menghapus data**; banner merah muncul di panel
  selama aktif. Dapat dilepas kapan saja.
- Pintasan: `Ctrl+Z` undo, `Ctrl+Enter` konfirmasi pick, `Ctrl+Shift+N` nickname,
  `Ctrl+Shift+L` logo & nama tim (semua dihindari saat
  mengetik di input).
- Pencarian + filter hero (nama, role, lane, "hero bebas saja") dan lencana tier meta.

### Overlay draft (`/overlay/draft`)

- **full** (1920×1080): header skor turnamen, 5 slot per sisi + nama pemain, panel
  tengah (fase, sisi, aksi terakhir), baris ban di bawah. **Tanpa countdown draft**
  — pick 100% manual oleh operator.
- **compact**: versi ringkas.
- **lineup**: komposisi final kedua tim.
- **Branding turnamen** di kanan bawah (teks + logo sponsor) bila diaktifkan.
- **Slot logo tim** memakai `TeamLogo` — URL rusak diganti monogram, bukan ikon
  "gambar rusak".
- **Animasi terhindar dari pemutaran ulang**: entrance (pick/ban/fase/layout)
  hanya berjalan saat benar-benar berubah, bukan setiap kali klien (re)tersambung;
  `prefers-reduced-motion` dihormati, dan seluruh animasi dibekukan selama
  emergency stop aktif.
- Tanpa kontrol admin, tanpa tombol, latar **transparan** (`background` body & html
  `rgba(0,0,0,0)`) sehingga aman ditumpuk di atas gameplay OBS.

### Scoreboard (`/overlay/score`)

- Kill besar, gold (**format Indonesia** otomatis: `18,2k`, `12,8k`, `10k`,
  `9,6k` — desimal koma, suffix `k`; nilai `<1000` tampil apa adanya, data hilang
  tampil `–`), turret, lord, turtle, seri (best-of), MVP, pemenang game,
  baris lineup hero + nickname, serta **timer pertandingan** (MM:SS).
- **Tampilan mengikuti tema aktif**: pita header berwarna + pelat geometris
  kiri/kanan, sudut tajam, logo turnamen, sponsor, pill caster, dan teks info
  — semuanya diatur dari **tab Tema** (preset `rrq-gold`, `navy-tournament`,
  `modern-teal`, atau kustom) dan langsung tersinkron ke overlay tanpa reload.
- **Data jujur**: statistik yang belum diisi tampil `–`, dan ketika belum ada
  data pertandingan panel menampilkan "MENUNGGU DATA PERTANDINGAN" — tidak ada
  angka/placeholder palsu.
- **Angka statistik bergerak naik/turun** saat nilai berubah, banner `VICTORY`
  + nama pemenang saat game selesai, dan header berganti mulus saat nomor game
  bertambah.
- Layout **compact** berupa lower-bar; lebar/tinggi aman di 1920×1080 maupun
  1280×720 **tanpa scrollbar** (diuji otomatis).

Kedua overlay menerima perubahan dari control panel **tanpa reload**.

### Sponsor Edition overlay (`/overlay/templates/sponsor-edition`)

Layout siaran premium 1920×1080 (aman juga di 1280×720) dengan frame SVG
angular (`public/overlay/templates/sponsor-edition.html` untuk Browser Source
mentah + halaman React dengan desain identik):

- Header center plate terpadu: skor series, **timer pertandingan** (MM:SS),
  meta turnamen/playoff, dan badge status (`BERLANGSUNG`/`SELESAI`) — tanpa
  overlap (gap terverifikasi 1080p & 720p).
- Stats strip per sisi: **Gold** (fmtGold — `18,2k` + label `GOLD`), Turret, Lord.
  **Turtle tidak ditampilkan** (fokus MLBB modern).
- Slot logo tim + grid sponsor (maks 6) di kanan atas; latar transparan aman
  di atas gameplay.
- Data mengikuti state yang sama dengan `/overlay/score` (tanpa reload).

Tema tersimpan di `state.json` → `overlay.theme` (ikut autosave, backup, dan
restart); logo yang diunggah (turnamen/tim/sponsor) berada di
`server/data/logos/` dengan nama file buatan server.

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
npm run test:server      # uji backend + kesiapan multi-PC (tanpa browser)
npm run test:ocr         # uji pipeline OCR (normalizer, policy, endpoint frame)
npm run test:scoresight  # uji ScoreSight file bridge (parser, mapping, gerbang, timer)
node scripts/obs-ocr-test.js  # uji OBS capture + field policy (mock OBS)
npm test                 # E2E memakai browser sistem (Edge/Chrome) via puppeteer-core
npm run test:all         # server + ocr + scoresight + e2e berurutan
```

**Uji server** (`scripts/server-test.js`, **166 asersi**) meng-spawn proses server terpisah pada
port & `DATA_DIR` khusus (aman dijalankan bersamaan sesi dev) dan memeriksa **166
asersi**: health/status autosave, skema battle spell, validasi & penyimpanan logo
(nama file dibuat server), penolakan Origin asing, token operator untuk REST &
socket, peran overlay **baca-saja**, field overlay baru (branding/emergency),
**validasi tema** (preset tersimpan, warna `#RRGGBB` tidak valid ditolak utuh
dengan pesan jelas, sponsor `javascript:`/lebih dari 6 ditolak, caster dipotong,
visibilitas bisa diubah, tema ↔ skor saling independen, tema bertahan lewat
`match:nextGame`, autosave → restart → tema masih ada), **draft dijalankan
sampai aksi terakhir tanpa galat** (pick ke-20 → status `done`, timer berhenti,
undo kembali berjalan), `match:nextGame`, autosave → restart →
state pulih persis, `state.json` rusak → pulih dari backup, retensi backup
(`BACKUP_KEEP`), penulisan atomik (tanpa sisa `.tmp`), serta **integrasi GRID
(42 asersi)**: endpoint `/api/integration` butuh token, default `manual` nonaktif,
`configured=false` tanpa credential, overlay ditolak mengubah integrasi, patch
invalid (sumber/mode/fixture) ditolak, **monitor mengalirkan feed tanpa menyentuh
state/revision**, **auto (gerbang ganda) mengisi draft penuh lewat Draft Engine**
dengan hero yang seluruhnya ada di dataset, **auto tanpa `AUTOMATION_ENABLED`
menahan tulisan state**, **semi mengantre + Aktifkan/Tolak berfungsi**, dan
**fixture invalid seluruhnya ditolak tanpa mengubah state**.

**E2E** (`scripts/e2e-test.js`) membuka halaman nyata dan memeriksa **121 asersi**:
kesiapan control panel, input turnamen/tim/roster, pick/undo/lock/reset,
**verifikasi tanpa countdown** (tidak ada kontrol/teks countdown di panel maupun
overlay — giliran 100% operator), transparansi overlay, sinkronisasi real-time
tanpa reload, perubahan layout, simpan/muat pertandingan, route 404, indikator
autosave/backup, emergency stop (aktif + banner + log terstruktur), branding yang
benar-benar tampil di overlay, pintasan `Ctrl+Shift+N`, kejujuran data battle spell,
unggah logo, label riwayat, transisi game berikutnya, **pick terakhir hingga draft
selesai tanpa pesan galat** (termasuk undo dari status selesai), **tab Tema**
(preview live, Simpan/Batal, preset, warna berubah di preview tanpa menyentuh
server hingga disimpan, tema terlihat di `/overlay/score` lewat CSS variable,
overlay tetap transparan + tanpa kontrol, bebas scrollbar di 1280×720, konfigurasi
dipulihkan setelah uji), **tab GRID** (pilihan sumber data, pesan jujur tanpa
credentials, mode semi + Aktifkan menerapkan pengajuan ke draft, badge sumber &
sinkron, feed bisa dihentikan, **tanpa input credential di browser**, state
dipulihkan ke manual), **tab ScoreSight** (status bridge, start/stop/refresh,
pemetaan Home→Blue/Red), serta memastikan tidak ada error console maupun request
4xx/5xx.

**Uji OCR** (`scripts/ocr-test.js`, **34 asersi**) memeriksa normalisasi teks OCR
(timer/kills/gold termasuk suffix `k`/`K` dan pemisah desimal), field policy
OBSERVE-ONLY, endpoint `POST /api/ocr/frame` (validasi gambar, token operator),
dan gerbang penulisan skor.

**Uji ScoreSight** (`scripts/scoresight-test.js`, **95 asersi**) memeriksa parser
file (integer, suffix-k, koma≡titik, mode `raw`/`thousands`), allowlist 9 file +
penolakan path traversal, mapping Home/Away, gerbang `scoreInput`/`dataSource`
(source-priority: OCR/GRID tidak menimpa ScoreSight), sinkron `Time.txt` →
`matchTimer` (`timeSource=scoresight`, start manual ditolak), serta `fmtGold`.

**Uji OBS OCR** (`scripts/obs-ocr-test.js`, **39 asersi**) memakai mock OBS
WebSocket: koneksi/auth, capture interval, kebijakan per-field, dan token.

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
├── shared/
│   └── theme.js              # tema scoreboard: preset bawaan, validasi warna/sponsor,
│                             #   sanitizer, CSS variable --sc-* (dipakai client + server)
├── public/assets/            # hero, skill, item, font, manifest, logos/
├── public/overlay/templates/ # sponsor-edition.html (Browser Source mentah)
├── server/
│   ├── index.js              # Express + Socket.IO + REST + keamanan + static + ticker
│   ├── draftEngine.js        # murni tanpa I/O: state machine draft, matchTimer, nextGame, emergency
│   ├── presets.js            # preset urutan draft + validator
│   ├── store.js              # state aktif + jadwal autosave (wajah penyimpanan)
│   ├── storage.js            # lapisan file: tulis atomik, backup, pemulihan, DATA_DIR
│   ├── ocr/                  # pipeline OCR (normalizer, field policy, OBS capture)
│   ├── scoresight/           # file bridge ScoreSight (allowlist 9 file, goldMode)
│   │   ├── config.js         # env SCORESIGHT_* + redacted()
│   │   └── fileBridge.js     # parseGold/parseTimeMs, poll, mapping, apply callback
│   ├── grid/                 # adapter data eksternal (isolasi total dari draft engine)
│   │   ├── index.js          # controller: provider → reconciler → mapper → validator
│   │   │                     #   → normalizer → mode gate → apply (mutate)
│   │   ├── config.js         # baca .env/env vars + redacted() (tanpa secret)
│   │   ├── client.js         # provider fixture & grid (discovery → degraded jujur)
│   │   ├── reconciler.js     # dedup · urutan · idempotensi · last-known-good
│   │   ├── mapper.js         # raw → canonical; tipe tak dikenal → unsupported
│   │   ├── validator.js      # hero di dataset 133 · angka wajar · urutan draft
│   │   ├── normalizer.js     # canonical → patch (unknown ≠ zero)
│   │   ├── lifecycle.js      # status & transisi lifecycle yang diizinkan
│   │   ├── graphql.js        # request GraphQL generik (timeout/backoff/retry)
│   │   ├── websocket.js      # WS generik (heartbeat, reconnect) untuk feed live
│   │   ├── discovery.js      # introspection standar → laporan discovery
│   │   ├── broadcast-controller.js  # kontrak event siaran (DRAFT_STARTED, dst.)
│   │   ├── audit.js          # ring audit di memori (200 entri, tanpa secret)
│   │   └── fixtures/         # draft · live · finished · invalid · reconnect
│   │                         #   · out-of-order (pengujian tanpa kredensial)
│   └── data/                 # heroes, meta, equipment, emblems, builds,
│                             # battle-spells(.schema).json, teams-catalog.json,
│                             # state.json (overlay.theme, sponsors),
│                             # matches/, backups/, logos/, sponsors/
├── .env.example              # templat konfigurasi GRID (tanpa nilai rahasia)
├── scripts/
│   ├── fetch-hero-data.js
│   ├── import-database.js
│   ├── validate-data.js
│   ├── import-battle-spells.js   # impor manual battle spell + validasi skema
│   ├── build-teams-catalog.mjs   # bangun katalog tim dari Markdown → server/data/
│   ├── server-test.js            # 166 asersi backend/multi-PC (tanpa browser)
│   ├── ocr-test.js               # 34 asersi pipeline OCR
│   ├── obs-ocr-test.js           # 39 asersi OBS capture + field policy (mock OBS)
│   ├── scoresight-test.js        # 95 asersi file bridge ScoreSight
│   ├── fixtures/scoresight/      # file .txt fixture untuk uji bridge
│   └── e2e-test.js               # 121 asersi alur nyata via browser
└── src/
    ├── App.jsx  main.jsx  styles.css
    ├── lib/       store, socket, utils (fmtGold), data, overlay, anim,
    │              broadcast, assets (unggah/validasi logo & sponsor)
    ├── components/ ui, HeroImage, slots, HeroPicker, DraftBoard,
    │               sidepanels (ScorePanel + match timer), Stage, TeamLogo,
    │               Branding, ScorePreview, ScoreThemePanel, SponsorManagement,
    │               IntegrationPanel, ScoreSightPanel, ObsOcrPanel
    └── pages/     Control, OverlayDraft, OverlayScore, OverlaySponsorEdition
```

---

## 6. API & event Socket.IO

### REST

`GET /api/health` · `GET /api/state` · `GET /api/heroes` (`?q=&role=&lane=`) ·
`GET /api/heroes/:id` · `GET /api/meta` · `GET /api/equipment` · `GET /api/emblems` ·
`GET /api/builds` · `GET /api/presets` · `GET /api/manifest` ·
`GET /api/battle-spells` · `GET /api/teams-catalog` ·
`GET /api/integration` (status + audit, butuh token
operator bila `APP_AUTH_TOKEN` di-set) ·
`GET /api/scoresight` (status bridge, butuh token operator) ·
`POST /api/scoresight/refresh` (baca paksa, butuh token operator) ·
`GET /api/ocr/obs/status|sources` · `POST /api/ocr/obs/connect|start|stop|disconnect|policy` ·
`POST /api/ocr/frame` (upload gambar → reading OCR, butuh token operator) ·
`GET|POST /api/matches` · `GET /api/matches/:id` · `POST /api/matches/:id/load` ·
`DELETE /api/matches/:id` ·
`POST /api/logos` · `POST /api/sponsors` · `DELETE /api/sponsors/:id`
(semua butuh token operator bila `APP_AUTH_TOKEN` di-set)

`/api/health` juga mengembalikan status `autosave` (`lastSaveAt`, `lastSaveOk`,
`backupCount`, `lastLoadedFrom`, `dirty`) serta `authRequired`.

### Klien → server (request/ack)

`draft:pick` · `draft:undo` · `draft:reset` · `draft:preset` · `draft:lock` ·
`draft:allowDuplicates` · `timer` · `team:update` · `meta:update` · `score:update` ·
`overlay:update` · `announce` · `match:save` · `match:load` · `match:delete` ·
`match:new` · **`match:nextGame`** · **`matchTimer`** (`cmd`:
`start|pause|reset|set`) · **`emergency`** · `state:request` ·
**`integration:update`** (operator: konfigurasi sumber/mode + aksi
`start|stop|approve|reject`; ditolak untuk overlay) ·
**`scoresight:update`** (operator: aksi `start|stop|refresh` +
`patch{enabled,homeSide}`; ditolak untuk overlay)

### Server → klien

`hello` (state + `serverNow` + presence + `authRequired` + `autosave` +
`integrationStatus`) · `state` (+ `autosave`) · `presence` · `clock` ·
**`integration:status`** (status koneksi transien — sengaja
bukan bagian dari `state` agar setiap perubahan status tidak memicu autosave) ·
**`scoresight:status`** (snapshot bridge: running, 9 file, values, goldMode,
timeDiagnostic — juga transien)

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
- Tema scoreboard divalidasi server (`shared/theme.js`): warna wajib `#RRGGBB`,
  maksimal 6 sponsor dengan URL aman (protocol `javascript:` ditolak utuh),
  caster maksimal 48 karakter, dan patch yang gagal **tidak** menerapkan
  sebagian — state lama tetap utuh.
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

## 10. Integrasi data eksternal (GRID)

> **Status kejujuran: FIXTURE TESTED — GRID LIVE CONNECTION NOT VERIFIED.**
> Integrasi live memerlukan kredensial GRID Official Esports Data yang
> **tidak tersedia** bagi proyek ini; tanpa kredensial, endpoint/query/schema GRID
> tidak pernah diverifikasi dan tidak pernah dikarang. Yang sudah teruji adalah
> **arsitektur + pipeline lengkap** lewat fixture provider.

### Arsitektur

Pipeline (semua di `server/grid/`, terisolasi dari draft engine):

```
provider (fixture | grid)  →  reconciler  →  mapper  →  validator
   →  normalizer  →  gerbang mode  →  apply (mutate)  →  state  →  Socket.IO
```

- **reconciler** — deduplikasi, urutan (`seq` bolak-balik disangga), idempotensi
  (reconnect `A,A,B,A,C → A,B,C`), dan event rusak tidak membuat feed macet.
- **mapper** — raw → canonical; tipe event tak dikenal → `unsupported` (diaudit,
  bukan ditebak); hero harus resolusi ke dataset 133 (tanpa fuzzy-match).
- **validator** — angka wajar & bilangan bulat, sisi `blue/red`, lifecycle
  transisi diizinkan, urutan draft vs cursor internal (hanya saat event **akan
  diterapkan** — mode monitor tidak memaksakan urutan pada state yang sengaja
  tidak bergerak). Satu field rusak → **seluruh event ditolak** (tanpa tulis
  sebagian).
- **normalizer** — canonical → patch; **unknown ≠ zero**: field yang tidak
  dikirim tidak pernah dijadikan 0.

### Mode & gerbang

| Mode | Perilaku |
|---|---|
| `monitor` (default) | Hanya memantau: event dicatat ke daftar observasi, **state & revision tidak disentuh**. |
| `semi` | Event diantre sebagai pengajuan; operator menekan **Aktifkan/Tolak** (approve divalidasi ulang terhadap state terkini). |
| `auto` | Diterapkan otomatis **hanya bila dua gerbang terbuka**: `mode=auto` **dan** `AUTOMATION_ENABLED=true`. |

Nilai `integration.dataSource` juga bisa **`scoresight-files`** — sumber aktif
ScoreSight; saat dipilih, tulisan OCR & GRID ke skor **ditolak** (source-priority
guard, lihat bagian 11).

Semua perubahan tetap melewati Draft Engine (`pickHero`, `applyScorePatch`, dsb.)
dalam `mutate()` — cursor, used, revision, undo, dan autosave berperilaku persis
seperti input manual. Overlay hanya membaca `state` internal — **tidak pernah**
membaca payload provider.

### Konfigurasi

- `.env` (salin dari `.env.example`): `GRID_ENABLED`, `GRID_API_KEY`,
  `GRID_GRAPHQL_URL`, `GRID_WS_URL`, `GRID_COMPETITION_ID`, `GRID_SERIES_ID`,
  `GRID_DATA_SOURCE`, `GRID_FIXTURE`, `AUTOMATION_MODE`, `AUTOMATION_ENABLED`.
- Control panel → **tab GRID**: sumber data, mode, tombol sambung/putus,
  pengajuan semi, audit — **tanpa input credential di browser**.
- Status koneksi (`connecting/connected/degraded/error/…`) disiarkan lewat event
  `integration:status` (transien), bukan bagian `state` — perubahan status tidak
  memicu autosave/backup.
- `connected` hanya diberikan setelah permintaan data tervalidasi; discovery yang
  belum pernah berjalan dengan kredensial asli tetap dilaporkan **degraded** dengan
  catatan "mapping field live belum diverifikasi".

### Fixture (pengujian tanpa kredensial)

`server/grid/fixtures/`: `draft.json` (21 event: series + 10 ban + 10 pick),
`live.json` (skor + field tak dikenal), `finished.json`, `invalid.json`
(8 event rusak — seluruhnya ditolak), `reconnect.json` (replay/duplikat),
`out-of-order.json` (seq bolak-balik). Dijalankan otomatis oleh
`npm run test:server` (bagian 4) dan `npm test` (bagian 4, via UI).

Untuk pengujian lokal: pilih sumber **Fixture** + mode, lalu **Sambungkan** di
tab GRID.

---

## 11. Integrasi OCR OBS & ScoreSight

### OCR OBS (opsional)

Pipeline OCR di `server/ocr/` menangkap frame gameplay dari OBS Studio lewat
OBS WebSocket (`obs-websocket-js`), membaca field scoreboard (timer, kill blue/
red, gold blue/red) dengan Tesseract, lalu memfilter hasil lewat **field policy**:

- Default semua field **`disabled`** (OBSERVE-ONLY) — state tidak pernah disentuh
  tanpa kebijakan eksplisit.
- `scoreRed` & `goldBlue` **terkunci `review`** (kalibrasi ROI belum akurat —
  kejujuran di atas otomasi).
- Mode per-field: `disabled` \| `review` \| `auto-apply` (diatur via tab OBS OCR
  atau `POST /api/ocr/obs/policy`).
- Password OBS **hanya dibaca server** (`OCR_OBS_WS_PASSWORD`), tidak pernah
  dikirim ke browser/state/log.

### ScoreSight file bridge

Membaca output [ScoreSight](https://github.com/royshil/scoresight) (OCR scoreboard
eksternal) dari folder `SCORESIGHT_DIR` — **hanya 9 file allowlist** (Home/Away
Score, Gold, Lord, Turret, Time termasuk typo `Away Turet.txt`), read-only,
tanpa rebuild/dependensi ke app ScoreSight.

**Alur data:**

```
file .txt  →  parse (parseGold/parseTimeMs/count)  →  mapToSides (Home→Blue/Red)
  →  applyScoreSightPatch (gerbang)  →  state  →  Socket.IO  →  overlay (fmtGold)
```

- **Gerbang ganda** (source-priority): tulisan hanya diterima bila
  `scoreInput=external` **dan** `dataSource=scoresight-files` — OCR/GRID tidak
  pernah menimpa ScoreSight saat sumber aktif.
- **Gold**: satuan state = integer mentah. `parseGold` menerima integer (`9579`),
  suffix-k (`18.2k`), dan pemisah desimal koma **atau** titik (`18,2k`); mode
  env `SCORESIGHT_GOLD_MODE=thousands` meng-×1000 integer `<1000` bila memang
  format sumbernya ribuan. Konversi hanya di boundary bridge — `fmtGold()`
  di frontend **presentation layer saja** (koma desimal + suffix `k`).
- **Timer**: `Time.txt` (`MM:SS`) → `timeMs` → `syncMatchTimerFromScoreSight`
  menyetel `matchTimer.elapsedMs` + `timeSource='scoresight'` (toleransi 500 ms
  anti-fluktuasi). Saat `timeSource=scoresight`, start manual **ditolak** —
  timer HUD game adalah satu-satunya sumber.
- **Status bridge** (9 file dot, values, mapping, `goldMode`, timeDiagnostic)
  disiarkan via `scoresight:status` (transien) dan ditampilkan di tab ScoreSight.

**Konfigurasi ScoreSight (app eksternal, di luar repo):** box Gold harus
`Type=Text` dengan format `^\d{1,4}(?:[.,]\d)?[kKmM]?$` agar `18,2K` terbaca utuh
(Type Number membuang koma/K → `116`). Rect crop harus menangkap teks penuh.
Detail & bukti live: `scripts/report/SCORESIGHT-REPORT.md` dan
`scripts/report/GOLD-NORMALIZATION-REPORT.md`.

---

## 12. Keterbatasan

- **Battle spell tidak tersedia** di sumber data mana pun; tidak ada yang direka-reka.
  Impor sendiri bila dibutuhkan lewat `npm run data:battle-spells -- <file.json>`
  (wajib menyertakan file ikon; tanpa ikon, UI tidak menampilkan apa pun).
- Urutan draft adalah **preset turnamen**, bukan aturan resmi MPL/contained esports.
- Skor (kill/gold/dst) diinput manual oleh operator, lewat **ScoreSight file
  bridge** (bagian 11), atau lewat integrasi GRID `monitor/semi/auto` (bagian 10)
  — bukan ditarik langsung dari game client.
- Akurasi ScoreSight sepenuhnya bergantung pada **konfigurasi app ScoreSight**
  (rect crop + Type/Format box) — bridge hanya mempercayai angka yang lolos
  allowlist & parser; nilai OCR yang salah bukan bug bridge.
- Setelah state di-reset eksternal (mis. uji E2E pada server dev yang sama),
  bridge perlu **stop→start** (refresh tidak me-reset cache nilai) agar apply
  ulang; dalam game normal gold/timer terus berubah sehingga otomatis pulih.
- **Koneksi GRID live belum pernah diverifikasi** (tidak ada kredensial): schema,
  nama query, dan mapping field asli GRID harus dipetakan ulang lewat discovery
  dengan kredensial nyata sebelum klaim "terhubung live" boleh dibuat. Pemetaan
  fixture saat ini adalah **kontrak input adapter internal**, bukan klaim schema GRID.
- State aktif disimpan di file JSON: **satu proses server per `DATA_DIR`**.
  Banyak PC boleh mengendalikan/menonton lewat LAN, tetapi dua instance server tidak
  boleh menulis `state.json` yang sama secara bersamaan (jangan dijalankan dua kali
  dengan `DATA_DIR` yang sama).
- Logo tim/branding bisa berupa URL eksternal (bergantung jaringan siaran) atau
  unggahan lokal; gambar eksternal yang gagal dimuat otomatis diganti monogram.

---

## 13. Troubleshooting

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
- **ScoreSight tidak menulis gold / nilai aneh** → cek tab ScoreSight (dot 9 file,
  `MAPPING_REQUIRED`), pastikan `SCORESIGHT_HOME_SIDE` terisi, dan di app
  ScoreSight box Gold bertipe **Text** dengan format
  `^\d{1,4}(?:[.,]\d)?[kKmM]?$` (lihat bagian 11).
- **Timer tidak jalan / start manual ditolak** → `TIMER SOURCE: SCORESIGHT`
  berarti `Time.txt` menggerakkan timer; hentikan bridge (tab ScoreSight) untuk
  kembali ke kontrol manual.
- **Gold tampil `–`** → `scoreInput` belum `external` / `dataSource` belum
  `scoresight-files` (gerbang ganda bagian 11), atau patch ditahan mapping.
