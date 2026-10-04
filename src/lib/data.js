/**
 * src/lib/data.js
 * ---------------------------------------------------------------------------
 * Ambil dataset statis (hero, meta tier, preset) sekali lalu cache di memori.
 * ---------------------------------------------------------------------------
 */
import { store } from './store.js';

const cache = {
  heroes: null,
  meta: null,
  presets: null,
  equipment: null
};

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

export async function loadHeroes() {
  if (cache.heroes) return cache.heroes;
  const data = await getJson('/api/heroes');
  cache.heroes = data.heroes || [];
  return cache.heroes;
}

export async function loadMeta() {
  if (cache.meta) return cache.meta;
  try {
    cache.meta = await getJson('/api/meta');
  } catch {
    cache.meta = { lanes: {}, counterPicks: {}, heroTier: {} };
  }
  return cache.meta;
}

export async function loadPresets() {
  if (cache.presets) return cache.presets;
  cache.presets = await getJson('/api/presets');
  return cache.presets;
}

export async function loadEquipment() {
  if (cache.equipment) return cache.equipment;
  try {
    cache.equipment = await getJson('/api/equipment');
  } catch {
    cache.equipment = { items: [] };
  }
  return cache.equipment;
}

export async function loadHeroDetail(id) {
  return getJson(`/api/heroes/${encodeURIComponent(id)}`);
}

export function tierOf(meta, heroId) {
  const t = meta?.heroTier?.[heroId];
  if (!t) return null;
  const lanes = Object.values(t);
  const order = ['S-Tier', 'A-Tier', 'B-Tier', 'C-Tier'];
  return order.find((x) => lanes.includes(x)) || lanes[0] || null;
}

export function tierLane(meta, heroId) {
  return meta?.heroTier?.[heroId] || null;
}

export function invalidateDataCache() {
  cache.heroes = null;
  cache.meta = null;
  cache.presets = null;
  cache.equipment = null;
}

export async function apiHealth() {
  try {
    return await getJson('/api/health');
  } catch (e) {
    store.patch({ connected: false });
    return null;
  }
}
