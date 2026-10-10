/**
 * server/ocr/objectiveDetector.js
 * ---------------------------------------------------------------------------
 * Deteksi Lord/Turtle — HANYA dari teks aktual yang terbaca OCR.
 *
 * KRITIS (kutipan konstraint): "Jangan mengklaim Lord atau Turtle terdeteksi
 * tanpa bukti teks aktual." Ikon objective di HUD TIDAK OCR-readable dan
 * sengaja di-mark NOT_OCR_READABLE di bawah — jangan pernah menambah
 * pemetaan ikon→counter di sini.
 *
 * Counter hanya naik ketika crop notifikasi mengandung frasa Lord/Turtle
 * yang match regex, dengan dedup 3 detik per objective.
 */

const LORD_RE = /\blord\b/i;
const TURTLE_RE = /\bturtle\b/i;
const DEDUPE_MS = 3000;

export const NOT_OCR_READABLE = Object.freeze({
  lord_icon: 'NOT_OCR_READABLE',
  turtle_icon: 'NOT_OCR_READABLE',
  inventory_items: 'NOT_OCR_READABLE',
  gold_icon: 'NOT_OCR_READABLE'
});

/**
 * @param {{ povTeam?: 'blue'|'red' }} [opts]
 */
export function createObjectiveDetector(opts = {}) {
  const povTeam = opts.povTeam ?? 'blue';
  let last = null; // { key, at }

  return {
    /**
     * @param {string} text
     * @param {number} [now]
     * @returns {Array<{ type:'lord'|'turtle', team:null, text:string }>}
     *   team saat ini TIDAK bisa dipastikan dari teks "Lord has been slain"
     *   tanpa info pembunuh → event dikembalikan dengan team=null agar
     *   caller tidak menebak. (lihat LICENSES.md Deviation #2.)
     */
    detect(text, now = Date.now()) {
      if (!text) return [];
      const events = [];
      const check = (re, type) => {
        if (!re.test(text)) return;
        if (last && last.key === type && now - last.at < DEDUPE_MS) return;
        last = { key: type, at: now };
        events.push({ type, team: null, text: text.trim() });
      };
      check(LORD_RE, 'lord');
      check(TURTLE_RE, 'turtle');
      return events;
    },
    reset() {
      last = null;
    }
  };
}
