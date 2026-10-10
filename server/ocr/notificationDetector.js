/**
 * server/ocr/notificationDetector.js
 * ---------------------------------------------------------------------------
 * Deteksi notifikasi kill feed / turret dari crop teks tengah layar.
 * ScoreSight mendukung ini via field bertipe TEXT dengan format_regex;
 * di sini kita port sebagai detector event-driven:
 *
 * Aturan (DEVIASI kecil, didokumentasikan di LICENSES.md):
 *  - "Enemy Turret Destroyed" (dan varian casing) → event turret.
 *  - Tim yang kehilangan turret = tim LAWAN dari povTeam pengguna
 *    (povTeam='blue' → turret musuh hilang → red.turrets +1).
 *  - Dedup 3 detik: notifikasi sama tidak dihitung dua kali (anti flicker).
 *  - Lord/Turtle TIDAK dideteksi dari sini kecuali teks actual match —
 *    ikon objective TIDAK OCR-readable (jangan mengklaim tanpa bukti teks).
 */

const TURRET_RE = /enemy\s+turret\s+destroyed/i;
const ALLY_TURRET_RE = /(?:ally|your)\s+turret\s+(?:is\s+)?destroyed/i;
const DEDUPE_MS = 3000;

/**
 * @param {{ povTeam?: 'blue'|'red' }} [opts]
 */
export function createNotificationDetector(opts = {}) {
  const povTeam = opts.povTeam ?? 'blue';
  let lastEvent = null; // { key, at }

  return {
    /**
     * @param {string} text teks hasil OCR crop notifikasi (boleh kosong)
     * @param {number} [now] timestamp ms
     * @returns {null | { type:'turret', team:'blue'|'red', text:string }}
     */
    detect(text, now = Date.now()) {
      if (!text) return null;
      if (TURRET_RE.test(text)) {
        const team = povTeam === 'blue' ? 'red' : 'blue';
        const key = `turret:${team}`;
        if (lastEvent && lastEvent.key === key && now - lastEvent.at < DEDUPE_MS) {
          return null;
        }
        lastEvent = { key, at: now };
        return { type: 'turret', team, text: text.trim() };
      }
      if (ALLY_TURRET_RE.test(text)) {
        const key = `turret:${povTeam}`;
        if (lastEvent && lastEvent.key === key && now - lastEvent.at < DEDUPE_MS) {
          return null;
        }
        lastEvent = { key, at: now };
        return { type: 'turret', team: povTeam, text: text.trim() };
      }
      return null;
    },
    reset() {
      lastEvent = null;
    }
  };
}
