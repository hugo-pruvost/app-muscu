// Couche de stockage. Toute l'app passe par ce module : pour une version
// claude.ai (base partagée) ou une base en ligne, seul ce fichier change.
// Version actuelle : localStorage du téléphone.

const PREFIXE = 'muscu.v1.';

export function lire(cle, defaut) {
  try {
    const v = localStorage.getItem(PREFIXE + cle);
    return v == null ? defaut : JSON.parse(v);
  } catch {
    return defaut;
  }
}

export function ecrire(cle, valeur) {
  try {
    if (valeur == null) localStorage.removeItem(PREFIXE + cle);
    else localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
    return true;
  } catch (err) {
    console.error('Échec de la sauvegarde', err);
    return false;
  }
}

function cles() {
  const res = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIXE)) res.push(k.slice(PREFIXE.length));
    }
  } catch {}
  return res;
}

/* ---------- Photos des exos (IndexedDB : trop lourdes pour localStorage) ---------- */

let dbPromesse = null;
function db() {
  dbPromesse ??= new Promise((ok, ko) => {
    const req = indexedDB.open('muscu', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
  return dbPromesse;
}
async function tx(mode, action) {
  const base = await db();
  return new Promise((ok, ko) => {
    const t = base.transaction('photos', mode);
    const req = action(t.objectStore('photos'));
    t.oncomplete = () => ok(req?.result);
    t.onerror = () => ko(t.error);
  });
}
export const lirePhoto = (exoId) => tx('readonly', (s) => s.get(exoId)).catch(() => null);
export const ecrirePhoto = (exoId, blob) => tx('readwrite', (s) => s.put(blob, exoId));
export const supprimerPhoto = (exoId) => tx('readwrite', (s) => s.delete(exoId));
const toutesLesPhotos = () =>
  tx('readonly', (s) => s.getAllKeys())
    .then(async (ids) => Promise.all((ids || []).map(async (id) => [id, await lirePhoto(id)])))
    .catch(() => []);

const blobVersTexte = (blob) =>
  new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.readAsDataURL(blob);
  });
const texteVersBlob = (dataUrl) => fetch(dataUrl).then((r) => r.blob());

/* ---------- Sauvegarde complète ---------- */

export async function exporterTout() {
  const donnees = {};
  for (const k of cles()) donnees[k] = lire(k, null);
  const photos = {};
  for (const [id, blob] of await toutesLesPhotos()) if (blob) photos[id] = await blobVersTexte(blob);
  return { app: 'muscu', format: 1, exporte: new Date().toISOString(), donnees, photos };
}

export async function importerTout(sauvegarde) {
  if (!sauvegarde || sauvegarde.app !== 'muscu' || typeof sauvegarde.donnees !== 'object') {
    throw new Error("Ce fichier n'est pas une sauvegarde Muscu.");
  }
  for (const k of cles()) ecrire(k, null);
  for (const [k, v] of Object.entries(sauvegarde.donnees)) ecrire(k, v);
  for (const [id, texte] of Object.entries(sauvegarde.photos || {})) {
    try { await ecrirePhoto(id, await texteVersBlob(texte)); } catch {}
  }
}

export async function toutEffacer() {
  for (const k of cles()) ecrire(k, null);
  try { await tx('readwrite', (s) => s.clear()); } catch {}
}

// Demande au navigateur de ne pas effacer les données en cas de manque de place.
export async function demanderPersistance() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch {}
  return false;
}
