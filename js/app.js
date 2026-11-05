import * as store from './storage.js';
import { esc } from './util.js';
import { carteMuscles, texteMuscles } from './muscles.js';
import { JOURS, vueRepas, scenarioDuJour, prochaineEtape, suiviDu, majSuivi } from './repas.js';

/* =========================================================================
   État et utilitaires
   ========================================================================= */

let programme = null;
let nutrition = null;
const etat = {
  reglages: { variante: 'A', son: true, ...store.lire('reglages', {}) },
  active: store.lire('active', null), // séance en cours
  historique: store.lire('historique', []), // séances terminées, triées par date
};

const app = document.getElementById('app');
const reposEl = document.getElementById('repos');
const toastEl = document.getElementById('toast');

const sauverActive = () => store.ecrire('active', etat.active);
const sauverHistorique = () => store.ecrire('historique', etat.historique);
const sauverReglages = () => store.ecrire('reglages', etat.reglages);

// Accepte « 37,5 » (clavier français) comme « 37.5 ».
function num(v) {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
const fmtNum = (n) => (n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ','));

function fmtDuree(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}
function fmtDureeCourte(ms) {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}
function fmtRepos(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}
const dateLongue = (ts) => new Date(ts).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dateCourte = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

const hautFourchette = (reps) => {
  const m = String(reps).match(/(\d+)\s*$/);
  return m ? +m[1] : null;
};

// Estimation du max sur 1 rep (Epley) : permet de comparer 38 kg × 9 et 40 kg × 7.
const e1rm = (poids, reps) => poids * (1 + reps / 30);

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('visible'), 2600);
}

const icone = {
  courbe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L19 8"/></svg>',
  photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

/* =========================================================================
   Programme
   ========================================================================= */

function seanceDuJour(date = new Date()) {
  const jour = JOURS[date.getDay()];
  const semaine = programme.semaines[etat.reglages.variante] || {};
  return { jour, seanceId: semaine[jour] ?? null };
}

function exoDef(seanceId, exoId) {
  return programme.seances[seanceId]?.exos.find((e) => e.id === exoId);
}

// Tous les exos du programme, sans doublon (le développé militaire est dans Push A et B).
function tousLesExos() {
  const vus = new Map();
  for (const [sid, s] of Object.entries(programme.seances)) {
    for (const e of s.exos) if (!vus.has(e.id)) vus.set(e.id, { ...e, seanceId: sid });
  }
  return [...vus.values()];
}

/* =========================================================================
   Historique et comparaisons
   ========================================================================= */

// Dernière fois que l'exo a été fait (hors séances où la machine était remplacée).
function dernierePerf(exoId) {
  for (let i = etat.historique.length - 1; i >= 0; i--) {
    const s = etat.historique[i];
    const e = s.exos.find((x) => x.exoId === exoId && !x.remplace && x.series.length);
    if (e) return { date: s.debut, series: e.series };
  }
  return null;
}

function doitMonter(def, perf) {
  if (!def || !perf) return false;
  const haut = hautFourchette(def.reps);
  return !!haut && perf.series.length >= def.series && perf.series.every((s) => s.reps >= haut);
}

function comparer(s, prev) {
  if (!prev || s.poids == null || s.reps == null) return null;
  if (s.poids === prev.poids && s.reps === prev.reps) return 'egal';
  const a = s.poids > 0 || prev.poids > 0 ? e1rm(s.poids, s.reps) : s.reps;
  const b = s.poids > 0 || prev.poids > 0 ? e1rm(prev.poids, prev.reps) : prev.reps;
  if (a > b * 1.001) return 'mieux';
  if (a < b * 0.999) return 'moins';
  return 'egal';
}
const SYMBOLE = { mieux: '↑', egal: '=', moins: '↓' };

const txtSerie = (s) => `${fmtNum(s.poids)} × ${s.reps}`;
const meilleurE1rm = (series) => Math.max(...series.map((s) => e1rm(s.poids, s.reps)));

/* =========================================================================
   Son, écran allumé
   ========================================================================= */

let audioCtx = null;
// iOS n'autorise le son qu'après un geste de l'utilisateur : on l'active au premier appui.
function debloquerSon() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
}
function bip() {
  if (!etat.reglages.son || !audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    [0, 0.22, 0.44].forEach((d, k) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = k === 2 ? 1320 : 880;
      o.connect(g);
      g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.5, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.start(t + d);
      o.stop(t + d + 0.2);
    });
  } catch {}
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
}

let wakeLock = null;
async function garderEcranAllume() {
  if (!etat.active || wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => (wakeLock = null));
  } catch {}
}
function libererEcran() {
  try { wakeLock?.release(); } catch {}
  wakeLock = null;
}

/* =========================================================================
   Photos des machines et réglages perso par exo
   ========================================================================= */

const urlsPhotos = new Map(); // exoId -> URL d'objet (ou null si pas de photo)

async function urlPhoto(exoId) {
  if (!urlsPhotos.has(exoId)) {
    const blob = await store.lirePhoto(exoId);
    urlsPhotos.set(exoId, blob ? URL.createObjectURL(blob) : null);
  }
  return urlsPhotos.get(exoId);
}
function oublierPhoto(exoId) {
  const u = urlsPhotos.get(exoId);
  if (u) URL.revokeObjectURL(u);
  urlsPhotos.delete(exoId);
}

// Les vues s'affichent tout de suite ; les photos (lecture asynchrone) arrivent juste après.
async function hydraterPhotos(racine = app) {
  for (const el of racine.querySelectorAll('[data-photo]')) {
    const url = await urlPhoto(el.dataset.photo);
    el.classList.toggle('a-photo', !!url);
    const img = el.querySelector('img');
    if (img && url) img.src = url;
  }
}

// Réduit la photo (≈ 1000 px, JPEG) pour ne pas remplir le téléphone.
async function redimensionner(fichier, max = 1000) {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error('Image illisible'));
      i.src = url;
    });
    const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * r);
    c.height = Math.round(img.naturalHeight * r);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

const reglagesExo = () => store.lire('reglagesExo', {});

function voirPhoto(src) {
  const v = document.getElementById('visionneuse');
  v.querySelector('img').src = src;
  v.hidden = false;
}

/* =========================================================================
   Séance en cours : actions
   ========================================================================= */

function demarrer(seanceId) {
  if (etat.active) {
    if (etat.active.seanceId === seanceId) return (location.hash = '#/seance');
    if (!confirm(`Une séance ${etat.active.nom} est en cours. La remplacer ? (Elle sera perdue.)`)) return;
  }
  const def = programme.seances[seanceId];
  etat.active = {
    id: 's' + Date.now(),
    seanceId,
    nom: def.nom,
    debut: Date.now(),
    finRepos: null,
    dureeRepos: 0,
    exos: def.exos.map((e) => ({
      exoId: e.id,
      nom: e.nom,
      remplace: false,
      note: '',
      series: Array.from({ length: e.series }, () => ({ poids: '', reps: '', fait: false })),
    })),
  };
  sauverActive();
  location.hash = '#/seance';
}

function validerSerie(i, j) {
  const ex = etat.active.exos[i];
  const s = ex.series[j];
  if (s.fait) {
    s.fait = false;
    sauverActive();
    return rafraichirExo(i);
  }
  // Champ vide = on reprend la valeur proposée en gris (dernière fois ou série précédente).
  const ligne = app.querySelector(`[data-exo="${i}"] [data-serie="${j}"]`);
  const poids = num(s.poids) ?? num(ligne?.querySelector('[data-champ="poids"]')?.placeholder);
  const reps = num(s.reps) ?? num(ligne?.querySelector('[data-champ="reps"]')?.placeholder);
  if (poids == null || reps == null) return toast('Indique la charge et les reps');
  s.poids = fmtNum(poids);
  s.reps = String(Math.round(reps));
  s.fait = true;
  sauverActive();
  rafraichirExo(i);
  const def = exoDef(etat.active.seanceId, ex.exoId);
  lancerRepos(def?.repos || 90);
}

function terminer() {
  const a = etat.active;
  const faites = a.exos.reduce((n, e) => n + e.series.filter((s) => s.fait).length, 0);
  if (!faites) {
    if (confirm('Aucune série validée. Abandonner la séance ?')) abandonner(true);
    return;
  }
  const restantes = a.exos.reduce((n, e) => n + e.series.filter((s) => !s.fait).length, 0);
  const msg = restantes
    ? `Terminer la séance ? ${restantes} série(s) non validée(s) ne seront pas enregistrées.`
    : 'Terminer la séance ?';
  if (!confirm(msg)) return;

  const seance = {
    id: a.id,
    seanceId: a.seanceId,
    nom: a.nom,
    debut: a.debut,
    fin: Date.now(),
    exos: a.exos
      .map((e) => ({
        exoId: e.exoId,
        nom: e.nom,
        remplace: e.remplace,
        note: e.note,
        series: e.series.filter((s) => s.fait).map((s) => ({ poids: num(s.poids), reps: num(s.reps) })),
      }))
      .filter((e) => e.series.length),
  };
  // Comparaison avec la fois précédente, calculée avant d'ajouter la séance à l'historique.
  seance.bilan = seance.exos.map((e) => {
    const prev = e.remplace ? null : dernierePerf(e.exoId);
    if (!prev) return 'nouveau';
    const maintenant = meilleurE1rm(e.series), avant = meilleurE1rm(prev.series);
    if (maintenant > avant * 1.001) return 'mieux';
    if (maintenant < avant * 0.999) return 'moins';
    return 'egal';
  });

  etat.historique.push(seance);
  etat.historique.sort((x, y) => x.debut - y.debut);
  sauverHistorique();
  etat.active = null;
  sauverActive();
  libererEcran();
  arreterRepos();
  location.hash = '#/resume/' + seance.id;
}

function abandonner(sansConfirmer) {
  if (!sansConfirmer && !confirm('Abandonner la séance ? Rien ne sera enregistré.')) return;
  etat.active = null;
  sauverActive();
  libererEcran();
  arreterRepos();
  location.hash = '#/';
}

/* =========================================================================
   Minuteur de repos
   ========================================================================= */

let reposAlerte = false;
let reposMasquerT = null;

function lancerRepos(sec) {
  etat.active.finRepos = Date.now() + sec * 1000;
  etat.active.dureeRepos = sec;
  sauverActive();
  reposAlerte = false;
  clearTimeout(reposMasquerT);
  majRepos();
}
function ajusterRepos(delta) {
  if (!etat.active?.finRepos) return;
  etat.active.finRepos = Math.max(Date.now(), etat.active.finRepos + delta * 1000);
  etat.active.dureeRepos = Math.max(1, etat.active.dureeRepos + delta);
  reposAlerte = false;
  sauverActive();
  majRepos();
}
function arreterRepos() {
  if (etat.active) {
    etat.active.finRepos = null;
    sauverActive();
  }
  clearTimeout(reposMasquerT);
  reposEl.hidden = true;
  reposEl.classList.remove('fini');
  document.body.classList.remove('avec-repos');
}
function majRepos() {
  const fin = etat.active?.finRepos;
  if (!fin) {
    if (!reposEl.hidden && !reposEl.classList.contains('fini')) arreterRepos();
    return;
  }
  const reste = fin - Date.now();
  reposEl.hidden = false;
  document.body.classList.add('avec-repos');
  const total = (etat.active.dureeRepos || 1) * 1000;
  reposEl.querySelector('[data-repos-progression]').style.width = `${Math.min(100, (1 - Math.max(0, reste) / total) * 100)}%`;
  if (reste > 0) {
    reposEl.classList.remove('fini');
    reposEl.querySelector('[data-repos-titre]').textContent = 'Repos';
    reposEl.querySelector('[data-repos-temps]').textContent = fmtDuree(reste + 999).replace(/^0(\d):/, '$1:');
  } else if (!reposAlerte) {
    reposAlerte = true;
    reposEl.classList.add('fini');
    reposEl.querySelector('[data-repos-titre]').textContent = "Repos terminé, c'est reparti";
    reposEl.querySelector('[data-repos-temps]').textContent = '0:00';
    bip();
    reposMasquerT = setTimeout(arreterRepos, 6000);
  }
}

/* =========================================================================
   Vues
   ========================================================================= */

function vueAccueil() {
  const maintenant = new Date();
  const { jour, seanceId } = seanceDuJour(maintenant);
  const s = seanceId ? programme.seances[seanceId] : null;
  const v = etat.reglages.variante;
  const foot = programme.foot?.jour === jour;
  const creneau = programme.creneaux_salle?.[jour];

  let html = `
    <header class="page-tete">
      <p class="surtitre">${esc(dateLongue(maintenant))}</p>
      <h1>Aujourd'hui</h1>
    </header>
    <div class="segment" role="group" aria-label="Variante de la semaine">
      <button type="button" data-action="variante" data-v="A" class="${v === 'A' ? 'actif' : ''}">Semaine A</button>
      <button type="button" data-action="variante" data-v="B" class="${v === 'B' ? 'actif' : ''}">Semaine B</button>
    </div>`;

  if (foot) {
    html += `<div class="bandeau"><span>⚽</span><span><strong>Foot à ${esc(programme.foot.heure)}</strong> (intensité ${esc(programme.foot.intensite)}). Repas complet vers 18h-18h30, collation légère vers 20h, bien s'hydrater.</span></div>`;
  }

  if (etat.active) {
    html += `
      <div class="carte carte-principale">
        <p class="etiquette">Séance en cours</p>
        <h2>${esc(etat.active.nom)}</h2>
        <p class="info">Démarrée il y a <span class="chrono" data-chrono>${fmtDuree(Date.now() - etat.active.debut)}</span></p>
        <a class="btn" href="#/seance">Reprendre la séance</a>
      </div>`;
  } else if (s) {
    html += `
      <div class="carte carte-principale">
        <p class="etiquette">Séance du jour</p>
        <h2>${esc(s.nom)}</h2>
        ${creneau ? `<p class="info">Créneau conseillé : ${esc(creneau)}</p>` : ''}
        ${s.consigne ? `<p class="info">${esc(s.consigne)}</p>` : ''}
        <ul class="liste-exos">
          ${s.exos.map((e) => `<li><span>${esc(e.nom)}</span><span>${e.series} × ${esc(e.reps)}</span></li>`).join('')}
        </ul>
        <button type="button" class="btn" data-action="demarrer" data-id="${seanceId}">Commencer l'entraînement</button>
      </div>`;
  } else {
    html += `
      <div class="carte">
        <p class="etiquette">Repos</p>
        <h2>${foot ? 'Foot seulement' : 'Pas de séance prévue'}</h2>
        <p class="info">${foot ? 'Pas de musculation aujourd\'hui en semaine B.' : 'Récupération. Tu peux quand même lancer une séance ci-dessous.'}</p>
      </div>`;
  }

  if (nutrition) {
    const sc = scenarioDuJour(maintenant, programme, v);
    const etape = prochaineEtape(nutrition.scenarios[sc.id].etapes, maintenant);
    const suivi = suiviDu(maintenant);
    const titre = etape ? etape.titre.replace('{seance}', s?.nom || 'Séance') : null;
    html += `
      <a class="ligne-lien" href="#/repas">
        <span><strong>🍽️ Repas et collations</strong>
          <small>${etape ? `Prochain : ${esc(etape.heure)} · ${esc(titre)}` : 'Voir le déroulé de la journée'}${suivi.creatine ? '' : ' · créatine à prendre'}</small></span>
        <span class="chevron">›</span>
      </a>`;
  }

  html += `<h3 class="section-titre">Toutes les séances</h3>`;
  for (const [id, se] of Object.entries(programme.seances)) {
    html += `
      <a class="ligne-lien" href="#/apercu/${id}">
        <span><strong>${esc(se.nom)}</strong><small>${se.exos.length} exos · ${se.exos.reduce((n, e) => n + e.series, 0)} séries</small></span>
        <span class="chevron">›</span>
      </a>`;
  }
  app.innerHTML = html;
}

function vueApercu(seanceId) {
  const s = programme.seances[seanceId];
  if (!s) return (location.hash = '#/');
  app.innerHTML = `
    <a class="retour" href="#/">‹ Retour</a>
    <header class="page-tete"><h1>${esc(s.nom)}</h1>${s.consigne ? `<p class="info">${esc(s.consigne)}</p>` : ''}</header>
    ${s.exos
      .map((e, k) => {
        const perf = dernierePerf(e.id);
        return `
        <div class="carte">
          <div class="exo-tete">
            <div>
              <h2 style="font-size:17px">${k + 1}. ${esc(e.nom)}</h2>
              <p class="cible">${e.series} × ${esc(e.reps)} · repos ${fmtRepos(e.repos)}${e.charge ? ` · ${esc(e.charge)}` : ''}</p>
            </div>
            <a class="btn-icone" href="#/exo/${e.id}" aria-label="Historique, photo et réglages de l'exercice">${icone.courbe}</a>
          </div>
          ${visuelExo(e.id, e.cibles)}
          ${reglagesExo()[e.id] ? `<p class="reglage-exo">⚙︎ ${esc(reglagesExo()[e.id])}</p>` : ''}
          ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}
          <p class="series-texte" style="padding:0 4px;margin-top:8px">${perf ? `Dernière fois (${dateCourte(perf.date)}) : ${perf.series.map(txtSerie).join(' · ')}` : 'Pas encore fait'}</p>
          ${doitMonter(e, perf) ? `<div class="badge badge-monter">↑ Monte la charge cette fois</div>` : ''}
        </div>`;
      })
      .join('')}
    <button type="button" class="btn" data-action="demarrer" data-id="${seanceId}">Commencer l'entraînement</button>
    <h3 class="section-titre">Rappels</h3>
    <div class="carte aide"><ul style="margin:0;padding-left:18px">${programme.regles.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
}

function carteExo(ex, i) {
  const def = exoDef(etat.active.seanceId, ex.exoId) || {};
  const perf = ex.remplace ? null : dernierePerf(ex.exoId);
  const monter = !ex.remplace && doitMonter(def, perf);

  const lignes = ex.series
    .map((s, j) => {
      const p = perf?.series[j];
      const precedente = ex.series[j - 1];
      const phPoids = j > 0 && num(precedente.poids) != null ? precedente.poids : p ? fmtNum(p.poids) : '';
      const phReps = p ? p.reps : '';
      const cmp = s.fait ? comparer({ poids: num(s.poids), reps: num(s.reps) }, p) : null;
      return `
      <div class="ligne ${s.fait ? 'faite' : ''}" data-serie="${j}">
        <span class="num">${j + 1}</span>
        <span class="prec">${p ? txtSerie(p) : '—'}${cmp ? `<span class="cmp cmp-${cmp}">${SYMBOLE[cmp]}</span>` : ''}</span>
        <input class="champ" data-champ="poids" inputmode="decimal" autocomplete="off" aria-label="Charge série ${j + 1}" value="${esc(s.poids)}" placeholder="${esc(phPoids)}">
        <input class="champ" data-champ="reps" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Reps série ${j + 1}" value="${esc(s.reps)}" placeholder="${esc(phReps)}">
        <button type="button" class="valider" data-action="valider" aria-label="${s.fait ? 'Annuler' : 'Valider'} la série ${j + 1}">${icone.check}</button>
      </div>`;
    })
    .join('');

  const reglage = reglagesExo()[ex.exoId];
  return `
    <section class="exo" data-exo="${i}">
      <div class="exo-tete">
        <div>
          <h2>${esc(ex.nom)}</h2>
          <p class="cible">${def.series ?? ''} × ${esc(def.reps ?? '')} · repos ${fmtRepos(def.repos)}${def.charge ? ` · ${esc(def.charge)}` : ''}</p>
        </div>
        <a class="btn-icone" href="#/exo/${ex.exoId}" aria-label="Historique, photo et réglages de l'exercice">${icone.courbe}</a>
      </div>
      ${visuelExo(ex.exoId, def.cibles)}
      ${reglage ? `<p class="reglage-exo">⚙︎ ${esc(reglage)}</p>` : ''}
      ${def.note ? `<p class="note">${esc(def.note)}</p>` : ''}
      ${monter ? `<div class="badge badge-monter">↑ Monte la charge : ${hautFourchette(def.reps)} reps atteintes partout la dernière fois</div>` : ''}
      ${ex.remplace ? `<div class="badge badge-remplace">Équivalent utilisé : pas de comparaison</div>` : ''}
      <div class="series">
        <div class="ligne entete"><span></span><span>Préc.</span><span>kg</span><span>Reps</span><span></span></div>
        ${lignes}
      </div>
      ${ex.remplace ? `<input class="champ-note" data-champ="note" placeholder="Quel équivalent ? (ex. haltères)" value="${esc(ex.note)}">` : ''}
      <div class="exo-actions">
        <button type="button" data-action="ajouter-serie">+ Série</button>
        <button type="button" data-action="retirer-serie">− Série</button>
        <button type="button" data-action="remplacer">${ex.remplace ? 'Machine d\'origine' : 'Machine prise ?'}</button>
      </div>
    </section>`;
}

// Carte des muscles + emplacement photo (compact, pour la séance et l'aperçu).
function visuelExo(exoId, cibles) {
  const t = texteMuscles(cibles);
  return `
    <div class="exo-visuel" data-photo="${exoId}">
      <div class="exo-carte">${carteMuscles(cibles)}</div>
      <div class="exo-visuel-droite">
        ${t.principal ? `<p class="muscles-texte"><b>${esc(t.principal)}</b>${t.secondaire ? `<br><span>+ ${esc(t.secondaire)}</span>` : ''}</p>` : ''}
        <button type="button" class="photo-mini" data-action="voir-photo" aria-label="Voir la photo de la machine"><img alt=""></button>
        <label class="photo-ajout">${icone.photo}<span>Photo de la machine</span><input type="file" accept="image/*" data-action="photo" hidden></label>
      </div>
    </div>`;
}

function rafraichirExo(i) {
  const el = app.querySelector(`[data-exo="${i}"]`);
  if (!el) return;
  el.outerHTML = carteExo(etat.active.exos[i], i);
  hydraterPhotos(app.querySelector(`[data-exo="${i}"]`));
}

function vueSeance() {
  const a = etat.active;
  if (!a) return (location.hash = '#/');
  const def = programme.seances[a.seanceId];
  app.innerHTML = `
    <header class="seance-tete">
      <div>
        <h1>${esc(a.nom)}</h1>
        <span class="chrono" data-chrono>${fmtDuree(Date.now() - a.debut)}</span>
      </div>
      <button type="button" class="btn-terminer" data-action="terminer">Terminer</button>
    </header>
    ${def?.consigne ? `<p class="consigne">${esc(def.consigne)}</p>` : ''}
    ${a.exos.map(carteExo).join('')}
    <button type="button" class="btn-lien" data-action="abandonner">Abandonner la séance</button>`;
  garderEcranAllume();
}

function vueResume(id) {
  const s = etat.historique.find((x) => x.id === id);
  if (!s) return (location.hash = '#/');
  const nbSeries = s.exos.reduce((n, e) => n + e.series.length, 0);
  const volume = s.exos.reduce((n, e) => n + e.series.reduce((m, x) => m + x.poids * x.reps, 0), 0);
  const mieux = (s.bilan || []).filter((b) => b === 'mieux').length;
  app.innerHTML = `
    <header class="page-tete"><p class="surtitre">${esc(dateLongue(s.debut))}</p><h1>Bien joué 💪</h1></header>
    <div class="carte carte-principale">
      <h2>${esc(s.nom)}</h2>
      <div class="stat-grille">
        <div class="stat"><strong>${fmtDureeCourte(s.fin - s.debut)}</strong><span>Durée</span></div>
        <div class="stat"><strong>${nbSeries}</strong><span>Séries</span></div>
        <div class="stat"><strong>${mieux}</strong><span>Exos en progrès</span></div>
      </div>
      <p class="info">Volume total : ${Math.round(volume).toLocaleString('fr-FR')} kg</p>
    </div>
    <div class="carte">${s.exos
      .map((e, k) => {
        const b = s.bilan?.[k];
        const etiquette = { mieux: '<span class="cmp cmp-mieux">↑ mieux</span>', egal: '<span class="cmp cmp-egal">= pareil</span>', moins: '<span class="cmp cmp-moins">↓ moins bien</span>', nouveau: '<span class="cmp cmp-egal">première fois</span>' }[b] || '';
        return `<div class="histo-exo"><h3>${esc(e.nom)} ${etiquette}</h3><p class="series-texte">${e.series.map(txtSerie).join(' · ')}</p></div>`;
      })
      .join('')}</div>
    <a class="btn" href="#/">Retour à l'accueil</a>`;
}

function vueHistorique() {
  const onglet = etat.ongletHisto || 'seances';
  let html = `
    <header class="page-tete"><h1>Historique</h1></header>
    <div class="segment" role="group">
      <button type="button" data-action="onglet-histo" data-o="seances" class="${onglet === 'seances' ? 'actif' : ''}">Séances</button>
      <button type="button" data-action="onglet-histo" data-o="exos" class="${onglet === 'exos' ? 'actif' : ''}">Exercices</button>
    </div>`;
  if (onglet === 'seances') {
    if (!etat.historique.length) html += `<p class="vide">Aucune séance enregistrée pour l'instant.<br>Lance ta première séance depuis l'onglet Aujourd'hui.</p>`;
    for (const s of [...etat.historique].reverse()) {
      const nb = s.exos.reduce((n, e) => n + e.series.length, 0);
      html += `
        <a class="ligne-lien" href="#/historique/${s.id}">
          <span><strong>${esc(s.nom)}</strong><small style="text-transform:capitalize">${esc(dateLongue(s.debut))} · ${fmtDureeCourte(s.fin - s.debut)} · ${nb} séries</small></span>
          <span class="chevron">›</span>
        </a>`;
    }
  } else {
    for (const [sid, se] of Object.entries(programme.seances)) {
      html += `<h3 class="section-titre">${esc(se.nom)}</h3>`;
      for (const e of se.exos) {
        const perf = dernierePerf(e.id);
        html += `
          <a class="ligne-lien" href="#/exo/${e.id}">
            <span><strong style="font-size:16px">${esc(e.nom)}</strong><small>${perf ? `${dateCourte(perf.date)} : ${perf.series.map(txtSerie).join(' · ')}` : 'Pas encore fait'}</small></span>
            <span class="chevron">›</span>
          </a>`;
      }
    }
  }
  app.innerHTML = html;
}

function vueDetailHisto(id) {
  const s = etat.historique.find((x) => x.id === id);
  if (!s) return (location.hash = '#/historique');
  app.innerHTML = `
    <a class="retour" href="#/historique">‹ Historique</a>
    <header class="page-tete"><p class="surtitre">${esc(dateLongue(s.debut))}</p><h1>${esc(s.nom)}</h1>
      <p class="info">${new Date(s.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${fmtDureeCourte(s.fin - s.debut)}</p></header>
    <div class="carte">${s.exos
      .map(
        (e) => `<div class="histo-exo"><h3>${esc(e.nom)}${e.remplace ? ' <span class="cmp cmp-moins">(équivalent' + (e.note ? ' : ' + esc(e.note) : '') + ')</span>' : ''}</h3>
        <p class="series-texte">${e.series.map(txtSerie).join(' · ')}</p></div>`
      )
      .join('')}</div>
    <button type="button" class="btn btn-danger" data-action="supprimer-seance" data-id="${s.id}">Supprimer cette séance</button>`;
}

function graphique(points) {
  // points : [{date, val}] dans l'ordre chronologique
  const L = 320, H = 130, mg = { g: 34, d: 10, h: 10, b: 22 };
  const vals = points.map((p) => p.val);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 1) { min -= 1; max += 1; }
  const x = (k) => mg.g + (k / Math.max(1, points.length - 1)) * (L - mg.g - mg.d);
  const y = (v) => mg.h + (1 - (v - min) / (max - min)) * (H - mg.h - mg.b);
  const chemin = points.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(p.val).toFixed(1)}`).join(' ');
  return `
    <svg class="graphique" viewBox="0 0 ${L} ${H}" role="img" aria-label="Évolution de la force estimée">
      <line class="axe" x1="${mg.g}" y1="${H - mg.b}" x2="${L - mg.d}" y2="${H - mg.b}"/>
      <text x="${mg.g - 6}" y="${y(max) + 4}" text-anchor="end">${Math.round(max)}</text>
      <text x="${mg.g - 6}" y="${y(min) + 4}" text-anchor="end">${Math.round(min)}</text>
      <text x="${mg.g}" y="${H - 6}">${esc(dateCourte(points[0].date))}</text>
      <text x="${L - mg.d}" y="${H - 6}" text-anchor="end">${esc(dateCourte(points.at(-1).date))}</text>
      <path class="courbe" d="${chemin}"/>
      ${points.map((p, k) => `<circle class="point" cx="${x(k)}" cy="${y(p.val)}" r="3.5"/>`).join('')}
    </svg>`;
}

function vueExo(exoId) {
  const def = tousLesExos().find((e) => e.id === exoId);
  const occurrences = etat.historique
    .map((s) => ({ s, e: s.exos.find((x) => x.exoId === exoId) }))
    .filter((o) => o.e && o.e.series.length);
  const comparables = occurrences.filter((o) => !o.e.remplace);
  const meilleure = comparables.flatMap((o) => o.e.series).sort((a, b) => e1rm(b.poids, b.reps) - e1rm(a.poids, a.reps))[0];

  app.innerHTML = `
    <a class="retour" href="javascript:history.back()">‹ Retour</a>
    <header class="page-tete"><h1 style="font-size:24px">${esc(def?.nom ?? occurrences[0]?.e.nom ?? 'Exercice')}</h1>
      ${def ? `<p class="info">${def.series} × ${esc(def.reps)}${def.charge ? ` · ${esc(def.charge)}` : ''}</p>` : ''}
    </header>
    ${def?.note ? `<p class="note" style="margin:0 0 16px">${esc(def.note)}</p>` : ''}
    ${
      def?.cibles
        ? `<div class="carte">
            <p class="etiquette">Muscles travaillés</p>
            <div class="carte-grande">${carteMuscles(def.cibles, { legendes: true })}</div>
            <p class="legende-muscles"><span class="pastille p"></span>${esc(texteMuscles(def.cibles).principal)}
              ${texteMuscles(def.cibles).secondaire ? `<br><span class="pastille s"></span>${esc(texteMuscles(def.cibles).secondaire)}` : ''}</p>
          </div>`
        : ''
    }
    <div class="carte photo-carte" data-photo="${exoId}">
      <p class="etiquette">Ta machine</p>
      <button type="button" class="photo-grande" data-action="voir-photo" aria-label="Agrandir la photo"><img alt="Photo de la machine"></button>
      <p class="info sans-photo">Prends la machine en photo à la salle pour la reconnaître du premier coup d'œil.</p>
      <label class="btn btn-secondaire">${icone.photo}<span class="sans-photo-inline">Ajouter une photo</span><span class="avec-photo-inline">Changer la photo</span><input type="file" accept="image/*" data-action="photo" hidden></label>
      <button type="button" class="btn btn-lien avec-photo" data-action="supprimer-photo">Supprimer la photo</button>
      <label class="etiquette" style="display:block;margin-top:14px" for="reglage-exo">Réglages de la machine</label>
      <input id="reglage-exo" class="champ-note" data-reglage-exo="${exoId}" placeholder="Ex. siège cran 4, dossier 2" value="${esc(reglagesExo()[exoId] || '')}">
    </div>
    ${
      comparables.length >= 2
        ? `<div class="carte"><p class="etiquette">Force estimée (1 rep max, kg)</p>${graphique(comparables.map((o) => ({ date: o.s.debut, val: meilleurE1rm(o.e.series) })))}</div>`
        : ''
    }
    ${meilleure ? `<div class="carte"><p class="etiquette">Meilleure série</p><h2>${txtSerie(meilleure)}</h2></div>` : ''}
    ${
      occurrences.length
        ? `<div class="carte">${[...occurrences]
            .reverse()
            .map(
              (o) => `<div class="histo-exo"><h3 style="text-transform:capitalize">${esc(dateLongue(o.s.debut))}${o.e.remplace ? ' <span class="cmp cmp-moins">(équivalent)</span>' : ''}</h3>
              <p class="series-texte">${o.e.series.map(txtSerie).join(' · ')}</p></div>`
            )
            .join('')}</div>`
        : `<p class="vide">Pas encore d'historique pour cet exercice.</p>`
    }`;
}

function vueReglages() {
  const v = etat.reglages.variante;
  app.innerHTML = `
    <header class="page-tete"><h1>Réglages</h1></header>
    <div class="carte">
      <div class="reglage">
        <span>Variante de la semaine<small>A : jambes le lundi. B : jambes le dimanche soir.</small></span>
      </div>
      <div class="segment" role="group" style="margin:4px 0 0">
        <button type="button" data-action="variante" data-v="A" class="${v === 'A' ? 'actif' : ''}">Semaine A</button>
        <button type="button" data-action="variante" data-v="B" class="${v === 'B' ? 'actif' : ''}">Semaine B</button>
      </div>
    </div>
    <div class="carte">
      <label class="reglage">
        <span>Son à la fin du repos<small>Coupé si l'iPhone est en mode silencieux.</small></span>
        <span class="interrupteur"><input type="checkbox" data-action="son" ${etat.reglages.son ? 'checked' : ''}><span></span></span>
      </label>
    </div>

    <h3 class="section-titre">Sauvegarde</h3>
    <div class="carte">
      <p class="aide">Tes séances sont enregistrées sur ce téléphone uniquement. Exporte une sauvegarde de temps en temps (dans Fichiers ou iCloud Drive).</p>
      <button type="button" class="btn btn-secondaire" data-action="exporter">Exporter mes données</button>
      <label class="btn btn-secondaire" style="cursor:pointer">Importer une sauvegarde<input type="file" accept="application/json,.json" data-action="importer" hidden></label>
      <p class="info">${etat.historique.length} séance(s) enregistrée(s).</p>
    </div>

    <h3 class="section-titre">Installer sur l'iPhone</h3>
    <div class="carte aide">
      <ol>
        <li>Ouvre cette page dans <strong>Safari</strong>.</li>
        <li>Touche le bouton <strong>Partager</strong> (carré avec une flèche).</li>
        <li>Choisis <strong>Sur l'écran d'accueil</strong>.</li>
      </ol>
    </div>

    <button type="button" class="btn btn-danger" data-action="effacer">Effacer toutes les données</button>`;
}

/* =========================================================================
   Routeur et événements
   ========================================================================= */

function afficherRepas() {
  app.innerHTML = vueRepas({ programme, nutrition, reglages: etat.reglages, decalage: etat.jourRepas || 0 });
}
function dateRepas() {
  const d = new Date();
  d.setDate(d.getDate() + (etat.jourRepas || 0));
  return d;
}

let vuePrecedente = null;
let scrollSeance = 0;

function route() {
  const [vue, param] = location.hash.replace(/^#\/?/, '').split('/');
  if (vuePrecedente === 'seance') scrollSeance = window.scrollY;
  const onglet = { historique: 'historique', exo: 'historique', reglages: 'reglages', repas: 'repas' }[vue] || 'accueil';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('actif', a.dataset.nav === onglet));
  switch (vue) {
    case 'seance': vueSeance(); break;
    case 'apercu': vueApercu(param); break;
    case 'resume': vueResume(param); break;
    case 'historique': param ? vueDetailHisto(param) : vueHistorique(); break;
    case 'exo': vueExo(param); break;
    case 'reglages': vueReglages(); break;
    case 'repas': afficherRepas(); break;
    default: vueAccueil();
  }
  hydraterPhotos();
  // En revenant de l'historique d'un exo, on retrouve la séance là où on l'avait laissée.
  window.scrollTo(0, vue === 'seance' && vuePrecedente === 'exo' ? scrollSeance : 0);
  vuePrecedente = vue;
  majRepos();
}

document.addEventListener('click', (e) => {
  debloquerSon();
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const exoEl = b.closest('[data-exo]');
  const i = exoEl ? +exoEl.dataset.exo : null;
  const ligne = b.closest('[data-serie]');
  const j = ligne ? +ligne.dataset.serie : null;
  const a = etat.active;

  switch (b.dataset.action) {
    case 'demarrer': demarrer(b.dataset.id); break;
    case 'variante':
      etat.reglages.variante = b.dataset.v;
      sauverReglages();
      route();
      break;
    case 'valider': validerSerie(i, j); break;
    case 'ajouter-serie':
      a.exos[i].series.push({ poids: '', reps: '', fait: false });
      sauverActive();
      rafraichirExo(i);
      break;
    case 'retirer-serie': {
      const series = a.exos[i].series;
      if (series.length <= 1) return;
      if (series.at(-1).fait && !confirm('La dernière série est validée. La supprimer ?')) return;
      series.pop();
      sauverActive();
      rafraichirExo(i);
      break;
    }
    case 'remplacer':
      a.exos[i].remplace = !a.exos[i].remplace;
      sauverActive();
      rafraichirExo(i);
      break;
    case 'terminer': terminer(); break;
    case 'abandonner': abandonner(); break;
    case 'repos-moins': ajusterRepos(-15); break;
    case 'repos-plus': ajusterRepos(15); break;
    case 'repos-passer': arreterRepos(); break;
    case 'onglet-histo':
      etat.ongletHisto = b.dataset.o;
      vueHistorique();
      break;
    case 'supprimer-seance':
      if (!confirm('Supprimer définitivement cette séance de ton historique ?')) return;
      etat.historique = etat.historique.filter((s) => s.id !== b.dataset.id);
      sauverHistorique();
      location.hash = '#/historique';
      break;
    case 'exporter': exporter(); break;
    case 'effacer':
      if (!confirm('Effacer TOUTES tes données (historique, réglages, photos) ?')) return;
      if (!confirm('Vraiment sûr ? Pense à exporter une sauvegarde avant.')) return;
      store.toutEffacer().then(() => {
        location.hash = '#/';
        location.reload();
      });
      break;

    // Repas
    case 'jour-repas':
      etat.jourRepas = +b.dataset.d;
      afficherRepas();
      break;
    case 'creneau':
      majSuivi(dateRepas(), { creneau: b.dataset.c });
      afficherRepas();
      break;
    case 'eau': {
      const eau = Math.max(0, (suiviDu(new Date()).eau || 0) + +b.dataset.ml);
      majSuivi(new Date(), { eau });
      afficherRepas();
      break;
    }
    case 'creatine':
      majSuivi(new Date(), { creatine: !suiviDu(new Date()).creatine });
      afficherRepas();
      break;

    // Photos
    case 'voir-photo': {
      const src = b.querySelector('img')?.src;
      if (src) voirPhoto(src);
      break;
    }
    case 'fermer-photo':
      document.getElementById('visionneuse').hidden = true;
      break;
    case 'supprimer-photo': {
      const id = b.closest('[data-photo]')?.dataset.photo;
      if (!id || !confirm('Supprimer la photo de cette machine ?')) return;
      store.supprimerPhoto(id).then(() => {
        oublierPhoto(id);
        route();
      });
      break;
    }
  }
});

document.addEventListener('input', (e) => {
  const exoReglage = e.target.dataset?.reglageExo;
  if (exoReglage) {
    const tout = reglagesExo();
    const v = e.target.value.trim();
    if (v) tout[exoReglage] = v;
    else delete tout[exoReglage];
    store.ecrire('reglagesExo', tout);
    return;
  }
  const champ = e.target.dataset?.champ;
  if (!champ || !etat.active) return;
  const i = +e.target.closest('[data-exo]').dataset.exo;
  const ex = etat.active.exos[i];
  if (champ === 'note') ex.note = e.target.value;
  else ex.series[+e.target.closest('[data-serie]').dataset.serie][champ] = e.target.value.trim();
  sauverActive();
});

document.addEventListener('change', async (e) => {
  const action = e.target.dataset?.action;
  if (action === 'son') {
    etat.reglages.son = e.target.checked;
    sauverReglages();
    if (e.target.checked) bip();
  } else if (action === 'photo') {
    const fichier = e.target.files?.[0];
    const id = e.target.closest('[data-photo]')?.dataset.photo;
    if (!fichier || !id) return;
    try {
      const blob = await redimensionner(fichier);
      await store.ecrirePhoto(id, blob);
      oublierPhoto(id);
      await hydraterPhotos();
      toast('Photo enregistrée');
    } catch (err) {
      toast("Impossible d'enregistrer la photo");
      console.error(err);
    }
    e.target.value = '';
  } else if (action === 'importer') {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    try {
      const donnees = JSON.parse(await fichier.text());
      const nb = donnees?.donnees?.historique?.length ?? 0;
      if (!confirm(`Importer cette sauvegarde (${nb} séance(s)) ? Tes données actuelles seront remplacées.`)) return;
      await store.importerTout(donnees);
      location.hash = '#/historique';
      location.reload();
    } catch (err) {
      toast(err.message || 'Fichier illisible');
    }
  }
});

// Sélectionne le contenu du champ au toucher : on retape directement la nouvelle valeur.
document.addEventListener('focusin', (e) => {
  if (e.target.classList?.contains('champ')) setTimeout(() => e.target.select?.(), 0);
});

async function exporter() {
  const json = JSON.stringify(await store.exporterTout());
  const nom = `muscu-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  const fichier = new File([json], nom, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: 'Sauvegarde Muscu' });
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(fichier);
  const a = Object.assign(document.createElement('a'), { href: url, download: nom });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Chrono et minuteur : recalculés à partir de l'heure de début, donc justes
// même si l'iPhone a mis l'app en veille.
setInterval(() => {
  if (etat.active) {
    const txt = fmtDuree(Date.now() - etat.active.debut);
    document.querySelectorAll('[data-chrono]').forEach((el) => (el.textContent = txt));
  }
  majRepos();
}, 500);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    garderEcranAllume();
    majRepos();
  }
});

/* =========================================================================
   Démarrage
   ========================================================================= */

async function init() {
  try {
    [programme, nutrition] = await Promise.all(
      ['./programme.json', './nutrition.json'].map((f) => fetch(f, { cache: 'no-cache' }).then((r) => r.json()))
    );
  } catch (err) {
    app.innerHTML = `<p class="vide">Impossible de charger le programme.<br>${esc(err.message)}</p>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
  store.demanderPersistance();
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  if ('serviceWorker' in navigator && !local) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

init();
