# OCR Pipeline Evidence — ScoreSight Port

Date: 2026-10-10
Repo: mlbb-draft-studio
Scope: server/ocr/* + route POST /api/ocr/frame + scripts/ocr-test.js

## Why no regression

- `npm run test:server` — 131 PASS / 0 FAIL (all pre-existing endpoints, auth, integration, fixture pipeline, autosave, recovery intact).
- `npm run build` — vite build OK, 440 modules, dist written.
- `npm run test:ocr` — 25 PASS / 0 FAIL on public/assets/OCR/Gameplayforscoreboard.png (1384x706).

## What landed (observed on real server)

1. POST /api/ocr/frame (operator token + raw PNG/JPEG/WebP <= 8MB) returns 200 with readings, events, patch, applied:true.
2. PATCH path mutates state.score via applyScorePatch; integration.scoreSource becomes "ocr"; revision bumps.
3. io.emit("ocr:reading", ...) fires on each successful frame.
4. Auth: no token → 401. Non-image body → rejected.
5. Frame 2 identical crop → temporal tracker reuse (reused:true), values stable.
6. No false Lord/Turtle events from static scoreboard frame.
7. Honest calibration: timer 04:39→279000, scoreBlue 10, goldRed 12800 accurate; scoreRed "3" and goldBlue "11k" documented limitations in LICENSES.md.

## Bug fixed this session

remember() was called before the no_confidence format-gate, so reuse() on frame 2 returned ok:false (skip_similar_stale) and dropped values. remember() now runs after the format-gate for fresh frames only (server/ocr/index.js).

## Commands

```
npm run test:server   # 131/0
npm run build         # ok
npm run test:ocr      # 25/0
```

## Isolation

ocr-test spawns its own server on port 5197 with temp DATA_DIR and APP_AUTH_TOKEN; does not touch production state.
