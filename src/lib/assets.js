/**
 * src/lib/assets.js
 * ---------------------------------------------------------------------------
 * Utilitas unggah aset (logo turnamen/tim/sponsor) ke penyimpanan lokal
 * server. Nama file dibuat oleh server sehingga aman dari path traversal;
 * di sini kita hanya memvalidasi tipe & ukuran sebelum membuang bandwidth.
 * ---------------------------------------------------------------------------
 */
import { getOperatorToken } from './store.js';

export const MAX_LOGO_BYTES = 1_500_000; // 1.5 MB
export const LOGO_TYPES = /^image\/(png|jpe?g|webp|gif)$/;

/** Validasi file gambar; melempar pesan error yang bisa ditampilkan operator. */
export function assertLogoFile(file) {
  if (!file) throw new Error('Tidak ada file yang dipilih.');
  if (!LOGO_TYPES.test(file.type)) throw new Error('Logo harus berupa gambar PNG/JPG/WEBP/GIF.');
  if (file.size > MAX_LOGO_BYTES) throw new Error('Logo terlalu besar (maks 1.5 MB).');
  return true;
}

/** Baca File → data URL. */
export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.readAsDataURL(file);
  });
}

/** Unggah data URL ke POST /api/logos → mengembalikan URL publik /assets/logos/… */
export async function uploadLogo(dataUrl) {
  const token = getOperatorToken();
  const res = await fetch('/api/logos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-operator-token': token } : {}) },
    body: JSON.stringify({ dataUrl })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Server menolak gambar (HTTP ${res.status}).`);
  return data.url;
}

/** Pilih file → validasi → data URL (tanpa unggah). */
export async function pickLogoDataUrl(file) {
  assertLogoFile(file);
  return readAsDataUrl(file);
}
