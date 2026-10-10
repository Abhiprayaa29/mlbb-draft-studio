# Gameplay Frame Audit - OBSERVE-ONLY

Date: 2026-10-10
Scope: Video classification, frame identification, OCR pipeline observation.
Policy: All OCR fields remain `disabled`. LOCKED_REVIEW_FIELDS = ['scoreRed','goldBlue'] unchanged. Auto-apply remains OFF.

## Video Source

Path: `/home/abdillahabhi/Video/TUTORIAL  cara menjadi wasit di mobile legends TERBARU 2023 - Ran Tutorial (1080p, h264).mp4`
Note: double space in filename.
Duration: 1046.86 s (mediaDuration OBS: 1046858 ms)
Resolution: 1920x1080, h264, 30 fps

## Video Classification (100+ frames, 10s interval)

| Timestamp | Classification |
|-----------|---------------|
| 00:00-02:50 | Non-gameplay (intro, talking) |
| 03:00-04:20 | Gameplay |
| 04:30 | Settings overlay |
| 04:40-06:40 | Gameplay + fire-border overlay |
| 06:50-11:50 | Clean gameplay (best candidate) |
| 12:10-13:00 | Pause dialog |
| 13:10 | Countdown |
| 13:20-16:50 | Late-game gameplay |
| 17:10 | Pause |
| 17:20 | SUBSCRIBE card |

## Frame at 09:00 (full_540.png) - Visual Ground Truth

Verified visually and via manual crop OCR:
- Score: 13 - 10 (blue - red)
- Timer: 05:52
- Gold: 14.6k (blue) / 15.3k (red)

Manual crop (left:500, top:50, width:920, height:56) OCR result:
`"®%o Xo Sek 13 0552 10 $1s3kXo Wo\n"`
Parsed: 13, 0552 (= 05:52), 10, $1s3k (= 15.3k misread)

## Letterbox Detection

Top bar (blue RGB ~[98,155,220]) occupies y=0 to y=49.
Gameplay content begins at y=50.
Bottom bar detected at y~1030+.
Confirmed on: full_540.png, /tmp/obs-frame-540.png, and OBS-native screenshot.

## processFrame OBSERVE-ONLY Results

### Original frame (letterboxed, 1920x1080)

All fields: `reason=empty rawText=""`, `patch={}`.
Root cause: default ROI y=6 falls inside the blue letterbox bar, not the HUD.

### Letterbox-stripped (full_540_nolb.png, 1920x1030 content + pad)

| Field | ok | conf | value | reason | rawText |
|-------|----|----|-------|--------|---------|
| timer | false | null | null | no_confidence | "2." |
| scoreBlue | false | null | null | empty | "" |
| scoreRed | false | 0.27 | null | low_confidence | "77" |
| goldBlue | false | null | null | empty | "" |
| goldRed | false | null | null | empty | "" |
| notification | false | null | null | empty | "" |

Parsed values do NOT match ground truth (13-10, 05:52, 14.6k/15.3k).
patch: `{}` (no state change applied, consistent with disabled fields).

### Shifted frame (content aligned to y=6, /tmp/obs-frame-540-shifted.png)

| Field | ok | conf | value | reason | rawText |
|-------|----|----|-------|--------|---------|
| timer | false | null | null | no_confidence | "." |
| scoreBlue | false | null | null | empty | "" |
| scoreRed | false | null | null | empty | "" |
| goldBlue | false | null | null | empty | "" |
| goldRed | false | null | null | empty | "" |
| notification | false | null | null | empty | "" |

All fields empty or no_confidence. patch: `{}`.

### OBS-native screenshot (/tmp/obs-frame-540.png, seek 540s)

Same result: all fields empty due to letterbox at ROI y=6.
Manual crop OCR of topbar confirms correct values are present in frame:
`"®%o Xo Sek 13 0552 10 $1s3kXo Wo\n"` -> 13, 05:52, 10, 15.3k (approx).

## ROI Default Positions (unchanged)

From `server/ocr/index.js`:
- timer: `{x:925, y:6, w:111, h:54}`
- scoreBlue: `{x:833, y:6, w:73, h:54}`
- scoreRed: `{x:1044, y:6, w:61, h:54}`
- goldBlue: `{x:726, y:6, w:111, h:54}`
- goldRed: `{x:1133, y:6, w:100, h:54}`
- notification: `{x:480, y:248, w:960, h:151}`

These ROIs were calibrated for `Gameplayforscoreboard.png` (no letterbox, different HUD X-scale).
This video has letterbox (y offset ~50px) and different HUD X-position.

## Bright Text Column Scan (OBS frame, y=55..100, x=600..1400)

Detected runs:
- x=628..646 (w=18)
- x=707..721 (w=14)
- x=1136..1151 (w=15)
- x=1242..1259 (w=17)
- x=1327..1344 (w=17)

None of these align with default ROI X ranges (e.g. timer x=925..1036, scoreBlue x=833..906).

## Alternate Sources Check

- VideoGameplay.mp4: NOT FOUND (searched /home/abdillahabhi, /home/abdillahabhi/Video, /home/abdillahabhi/Downloads, /home/abdillahabhi/Pictures)
- Other files in /home/abdillahabhi/Video/:
  - 1791631370754.jpg.jpeg
  - Untitled design.png
  - Untitled design (1).png
  - WhatsApp Image 2026-10-10 at 18.26.15.jpeg
- No MLBB/draft/scoreboard/gameplay files found elsewhere.

## Conclusions

1. Full gameplay HUD IS present in the tutorial video (best range: 06:50-11:50).
2. OCR engine WORKS correctly on properly cropped topbar (manual crop proof).
3. Default ROI coordinates MISS the HUD because of letterbox offset (y=50) and X-scale mismatch.
4. No VideoGameplay.mp4 or alternate clean source exists on this machine.
5. ROI must NOT be changed based on this finding alone (per instruction: do not change ROI based on thumbnail/small evidence).
6. All fields remain disabled. scoreRed and goldBlue remain in LOCKED_REVIEW_FIELDS. Auto-apply remains OFF.

## Recommended Next Steps (require user decision)

- Option A: Provide a clean gameplay source (no letterbox, matching calibration frame) for testing.
- Option B: Perform proper ROI recalibration against a known-good full-resolution frame with verified ground truth, with user approval.
- Option C: Apply letterbox-aware pre-processing (crop y=50..1030) before OCR, but this changes capture pipeline and needs approval.

## Files

- `/tmp/mlbb-samples/f_001..f_105.jpg` - interval samples
- `/tmp/mlbb-labeled/t_001..t_105.jpg` - timestamp-labeled frames
- `/tmp/mlbb-sheets/sheet_1..4.jpg` - contact sheets
- `/tmp/mlbb-fullres/full_420.png, full_540.png, full_930.png` - full-res frames
- `/tmp/obs-frame-540.png` - OBS-native screenshot at 540s
- `/tmp/obs-frame-540-nolb.png, /tmp/obs-frame-540-shifted.png` - processed variants
- `/tmp/obs-topbar-540.png` - manual crop proof

## Commands Run

```bash
# Frame sampling
ffmpeg -i <video> -vf fps=1/10 /tmp/mlbb-samples/f_%03d.jpg

# processFrame standalone
node scripts/ocr-frame-check.mjs <frame.png>

# OBS seek + screenshot
node scripts/obs-seek-540.mjs
```
