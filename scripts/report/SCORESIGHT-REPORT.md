# ScoreSight File Bridge — Laporan Integrasi

**Status: SELESAI (belum commit)** · 14 Okt 2026

---

## 1. Path ScoreSight yang berhasil dibaca

```
C:\Users\user\Documents\Scoresight Mobile legend\
```

9 file `.txt` ditemukan dan dibaca (read-only).

---

## 2. Format aktual isi file

Audit dilakukan langsung terhadap file di disk (UTF-8, tanpa BOM, tanpa trailing newline):

| File | Contoh isi | Catatan |
|------|-----------|---------|
| `Home Score.txt` | `6` → `21` | Integer murni (kills in-game) |
| `Away Score.txt` | `2` → `5` | Integer |
| `Home Gold.txt` | `9579` → `231` | Integer mentah (bukan `k`) |
| `Away Gold.txt` | `8522` → `213` | Integer |
| `Home Turret.txt` | `2` → `3` | Integer |
| **`Away Turet.txt`** | `0` → `3` | **Typo bawaan ScoreSight** — bridge mengikuti nama aktual |
| `Home Lord.txt` | `0` | Integer |
| `Away Lord.txt` | `0` | Integer |
| `Time.txt` | `03:39` → `08:54` | Format `MM:SS` — **hanya diagnostik, tidak diterapkan ke timer overlay** |

- Ditulis in-place (created time == write time; bukan rename).
- Nilai berubah saat game berjalan (dikonfirmasi via snapshot berulang).
- Parser juga mendukung format `31.4k` / `31k` untuk gold (ditemukan di fixture, belum terlihat di file live — ScoreSight live menulis integer mentah).

---

## 3. Mapping Home/Away

| ScoreSight | → | Draft Studio (homeSide=blue) |
|------------|---|------------------------------|
| Home | → | Blue |
| Away | → | Red |

Dikonfigurasi via `SCORESIGHT_HOME_SIDE` (env) atau dropdown Control Panel.
Jika belum dipilih → status `MAPPING_REQUIRED`, patch ditahan.

---

## 4. Field yang tersambung

| ScoreSight | State field | Semantik benar? |
|------------|-------------|-----------------|
| Home/Away Score | `score.blue/red.kills` | ✅ Kills in-game |
| Home/Away Gold | `score.blue/red.gold` | ✅ Gold |
| Home/Away Turret | `score.blue/red.turrets` | ✅ Turret |
| Home/Away Lord | `score.blue/red.lord` | ✅ Lord |
| Time | *(tidak diterapkan)* | ⏱ Diagnostik saja |

**Series score** (`teams[side].score`) TIDAK disentuh — ScoreSight hanya melaporkan data in-game.

---

## 5. Contoh nilai sebelum → sesudah parsing

```
Home Score.txt : "21"  → 21  → blue.kills = 21
Away Score.txt : "5"   → 5   → red.kills  = 5
Home Gold.txt  : "231" → 231 → blue.gold  = 231
Away Gold.txt  : "213" → 213 → red.gold   = 213
Home Turret    : "3"   → 3   → blue.turrets = 3
Away Turet.txt : "3"   → 3   → red.turrets  = 3
Time.txt       : "08:54" → "08:54" (diagnostik saja)
```

Patch yang dihasilkan (format `applyScorePatch`):
```json
{ "blue": { "kills": 21, "gold": 231, "lord": 0, "turrets": 3 },
  "red":  { "kills": 5,  "gold": 213, "lord": 0, "turrets": 3 } }
```

---

## 6. Bukti overlay menerima update

Screenshot: `scripts/report/scoresight-live-scoreboard.png`

```
score-kills-blue = "21"    score-kills-red = "5"
stat-gold-blue   = "231"   stat-gold-red   = "213"
stat-turret-blue = "3"     stat-turret-red = "3"
```

Nilai dibaca dari file live ScoreSight, diterapkan lewat bridge → Socket.IO → overlay tanpa input manual.

---

## 7. Hasil test/build

| Suite | Hasil |
|-------|-------|
| `npm run data:validate` | LULUS (0 error) |
| `npm run test:server` | **166/0** |
| `npm run test:ocr` | **34/0** |
| `node scripts/obs-ocr-test.js` | **39/0** |
| `npm run test:scoresight` | **46/0** |
| `npm test` (e2e) | **121/0** |
| `npx vite build` | hijau |

---

## 8. Integrasi live vs fixture

**Live (environment nyata):** ✅ Berhasil.
Server dijalankan dengan:
```
SCORESIGHT_ENABLED=true
SCORESIGHT_DIR=C:\Users\user\Documents\Scoresight Mobile legend
SCORESIGHT_HOME_SIDE=blue
```
Bridge membaca 9/9 file, menerapkan patch, overlay menampilkan nilai aktual game yang sedang berjalan.

**Fixture:** 46 unit test memakai fixture kecil di `scripts/fixtures/scoresight/` (bukan file pribadi).

---

## 9. Cara menjalankan / menghentikan bridge

### Environment (`.env`)
```bash
SCORESIGHT_ENABLED=true
SCORESIGHT_DIR=/mnt/scoresight          # path yang ter-baca di backend
SCORESIGHT_POLL_INTERVAL_MS=500
SCORESIGHT_HOME_SIDE=blue               # blue|red
```

### Gerbang tulis skor (wajib sebelum ScoreSight menulis state)
Di Control Panel → tab **GRID** → set:
- **Tulis skor**: `external` (bukan `manual-only`)
- **Sumber data**: `ScoreSight files`

Atau via socket:
```js
integration:update { patch: { scoreInput: 'external', dataSource: 'scoresight-files' } }
```

### Start / Stop
- **Control Panel** → tab **ScoreSight** → tombol Mulai / Berhenti / Muat ulang
- **Socket**: `scoresight:update { patch: { enabled, homeSide }, action: 'start'|'stop'|'refresh' }`
- **REST**: `GET /api/scoresight` (status), `POST /api/scoresight/refresh`

### Shared folder (Windows → CachyOS/Linux)
```
Windows: Share folder sebagai \\HOST\Scoresight (read-only)
Linux  : sudo mount -t cifs //HOST/Scoresight /mnt/scoresight -o guest,ro,vers=3.0
.env   : SCORESIGHT_DIR=/mnt/scoresight
```
Backend **tidak perlu akses tulis** — bridge hanya membaca.

---

## 10. Keamanan & aturan prioritas sumber

- **Allowlist ketat**: hanya 9 file di dalam `SCORESIGHT_DIR`. Path traversal ditolak.
- **Manual-only**: default `scoreInput=manual-only` — ScoreSight TIDAK menulis skor sampai operator membuka gerbang.
- **Sumber aktif**: patch hanya diterapkan bila `dataSource=scoresight-files`. GRID/OCR tidak menimpa selama sumber ini aktif.
- **Nilai tidak berubah** → tidak ada revision increment / emit.
- **File kosong/malformed** → tidak dianggap nol; nilai state valid tidak ditimpa.
- **Time** tidak pernah menjadi timer overlay.

---

## File yang diubah/ditambah

| File | Perubahan |
|------|-----------|
| `server/scoresight/fileBridge.js` | **Baru** — bridge inti |
| `server/scoresight/config.js` | **Baru** — config env |
| `server/index.js` | Import bridge, apply handler, REST, socket, auto-start |
| `server/draftEngine.js` | `DATA_SOURCES` + `scoresight` field di integration |
| `server/grid/config.js` | `DATA_SOURCES` + `scoresight-files` |
| `src/components/ScoreSightPanel.jsx` | **Baru** — Control Panel UI |
| `src/components/IntegrationPanel.jsx` | Opsi `scoresight-files` |
| `src/pages/Control.jsx` | Tab ScoreSight |
| `src/lib/store.js` | `scoresightStatus` |
| `src/lib/socket.js` | Handler `scoresight:status` |
| `.env.example` | SCORESIGHT_* + dokumentasi shared folder |
| `scripts/scoresight-test.js` | **Baru** — 46 test |
| `package.json` | `test:scoresight` script |
