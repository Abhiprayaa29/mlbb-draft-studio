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

/* ------------------------------------------------------------- sponsor --
 * Sponsor diunggah sebagai file asli (multipart/form-data) ke
 * POST /api/sponsors — server yang menyimpan file & metadata persisten.
 * Di sini hanya validasi tipe/ukuran awal + preview sementara (objectURL).
 */
export const MAX_SPONSOR_BYTES = 5_000_000; // 5 MB
export const SPONSOR_TYPES = /^image\/(png|jpe?g|webp)$/;

/** Validasi file sponsor; melempar pesan error yang bisa ditampilkan operator. */
export function assertSponsorFile(file) {
  if (!file) throw new Error('Tidak ada file yang dipilih.');
  if (!SPONSOR_TYPES.test(file.type)) throw new Error('Sponsor harus berupa gambar PNG/JPG/WebP.');
  if (file.size > MAX_SPONSOR_BYTES) throw new Error('File sponsor terlalu besar (maks 5 MB).');
  return true;
}

/** Unggah banyak file sponsor sekaligus (multipart) → daftar sponsor terbaru. */
export async function uploadSponsorFiles(fileList) {
  const fd = new FormData();
  for (const f of fileList) fd.append('files', f, f.name);
  const token = getOperatorToken();
  const res = await fetch('/api/sponsors', {
    method: 'POST',
    headers: token ? { 'x-operator-token': token } : {},
    body: fd
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Server menolak unggahan (HTTP ${res.status}).`);
  return data;
}

/** Hapus sponsor (metadata + file di server). */
export async function deleteSponsor(id) {
  const token = getOperatorToken();
  const res = await fetch(`/api/sponsors/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: token ? { 'x-operator-token': token } : {}
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Gagal menghapus sponsor (HTTP ${res.status}).`);
  return data;
}

/** Simpan urutan tampil sponsor (daftar ID lengkap, urutan array = tampilan). */
export async function reorderSponsors(ids) {
  const token = getOperatorToken();
  const res = await fetch('/api/sponsors/order', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-operator-token': token } : {}) },
    body: JSON.stringify({ ids })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Gagal mengubah urutan sponsor (HTTP ${res.status}).`);
  return data;
}
