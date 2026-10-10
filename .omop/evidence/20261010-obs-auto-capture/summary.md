# Evidence: Automatic OBS Capture (2026-10-10)

## Scope
OBS WebSocket 5.x automatic capture loop → processFrame() → shared applyFrameResult pipeline.
Default policy OBSERVE-ONLY (semua field disabled untuk auto-apply); scoreRed & goldBlue terkunci "review".

## Commands run (all exit 0)

| Command | Result | File |
|---|---|---|
| `node scripts/obs-ocr-test.js` | 39 PASS / 0 FAIL | test-obs-mock.txt |
| `npm run test:server` | 131 PASS / 0 FAIL | test-server.txt |
| `npm run test:ocr` | 25 PASS / 0 FAIL | test-ocr.txt |
| `npm run data:validate` | VALIDASI LULUS (10 info, 0 warning, 0 error) | data-validate.txt |
| `npm test` (e2e, browser) | 115 lulus / 0 gagal | e2e-report.json |
| `npm run build` | ✓ built in 13.11s | build.txt |

## Isolation / honesty
- E2E dijalankan terhadap server dev FRESH (uptime=1 detik, port 5174 setelah membunuh proses lama pid 71615 yang masih memegang port dengan kode lama).
- Unit mock OBS (39 asersi) memakai `createClient` injection — TIDAK menyentuh OBS nyata.
- **Uji live OBS WebSocket ke instance OBS sungguhan TIDAK dilakukan** di lingkungan dev ini (tidak ada OBS berjalan). Build hijau bukan bukti capture live.

## Key fixes recorded this session
1. Manual `/api/ocr/frame` tidak lagi difilter policy (operator paste = apply langsung); hanya loop OBS yang difilter.
2. Duplicate SIGINT/SIGTERM handler digabung (cleanupObsCapture + flushSync sekali saja).
3. ObsOcrPanel: request Socket.IO → fetch HTTP (cocok dengan route server).
4. e2e-test.js: kandidat browser Linux ditambahkan (chromium/chrome/edge + CHROME_PATH env).
