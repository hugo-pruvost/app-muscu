// Onglet Repas : chronologie du jour selon la séance et le créneau,
// suivi de l'eau et de la créatine. Contenu dans nutrition.json.
import * as store from './storage.js';
import { esc } from './util.js';

export const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function cleDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- Suivi du jour (eau, créatine, créneau choisi) ---------- */

export function suiviDu(date) {
  return store.lire('suivi', {})[cleDate(date)] || {};
}
export function majSuivi(date, modif) {
  const tout = store.lire('suivi', {});
  const k = cleDate(date);
  tout[k] = { ...(tout[k] || {}), ...modif };
  // On ne garde que les 90 derniers jours.
  const cles = Object.keys(tout).sort();
  for (const vieux of cles.slice(0, Math.max(0, cles.length - 90))) delete tout[vieux];
  store.ecrire('suivi', tout);
}

/* ---------- Choix du scénario ---------- */

export function scenarioDuJour(date, programme, variante) {
  const jour = JOURS[date.getDay()];
  const seanceId = programme.semaines[variante]?.[jour] ?? null;
  const foot = programme.foot?.jour === jour;
  const travail = programme.horaires_travail?.[jour];
  const choixCreneau = !!seanceId && !foot && !!travail && travail.startsWith('9h');
  let id;
  if (foot && seanceId) id = 'mercredi_foot';
  else if (foot) id = 'foot_seul';
  else if (!seanceId) id = 'repos';
  else if (!travail) id = 'dimanche_soir';
  else if (travail.startsWith('8h')) id = 'apres_travail_16h';
  else id = suiviDu(date).creneau === '17h' ? 'soir_17h' : 'matin_7h';
  return { id, jour, seanceId, choixCreneau };
}

const minutes = (h) => {
  const m = String(h).match(/^(\d{1,2})h(\d{2})?$/);
  return m ? +m[1] * 60 + +(m[2] || 0) : null;
};

// Prochaine étape de la journée (pour l'accueil et pour la mettre en avant).
export function prochaineEtape(etapes, date = new Date()) {
  const maintenant = date.getHours() * 60 + date.getMinutes();
  return etapes.find((e) => minutes(e.heure) != null && minutes(e.heure) >= maintenant - 15) || null;
}

/* ---------- Vue ---------- */

const ICONES = { collation: '🍌', repas: '🍽️', seance: '🏋️', foot: '⚽', sommeil: '🌙' };
const fmtL = (ml) => `${(ml / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L`;

export function vueRepas({ programme, nutrition, reglages, decalage = 0 }) {
  const aujourdhui = new Date();
  const date = new Date(aujourdhui);
  date.setDate(date.getDate() + decalage);

  const sc = scenarioDuJour(date, programme, reglages.variante);
  const scenario = nutrition.scenarios[sc.id];
  const nomSeance = sc.seanceId ? programme.seances[sc.seanceId]?.nom : null;
  const suivi = suiviDu(date);
  const obj = nutrition.objectifs;
  const eauCible = sc.id === 'repos' ? obj.eau_repos_ml : obj.eau_entrainement_ml;
  const prochaine = decalage === 0 ? prochaineEtape(scenario.etapes) : null;

  const puces = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(aujourdhui);
    d.setDate(d.getDate() + k);
    const libelle = k === 0 ? "Aujourd'hui" : k === 1 ? 'Demain' : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    return `<button type="button" data-action="jour-repas" data-d="${k}" class="${k === decalage ? 'actif' : ''}">${esc(libelle)}</button>`;
  }).join('');

  let html = `
    <header class="page-tete">
      <p class="surtitre">${esc(date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
      <h1>Repas</h1>
    </header>
    <div class="puces" role="group" aria-label="Jour">${puces}</div>`;

  if (sc.choixCreneau) {
    const c = suivi.creneau === '17h' ? '17h' : '7h';
    html += `
      <div class="segment" role="group" aria-label="Créneau de salle">
        <button type="button" data-action="creneau" data-c="7h" class="${c === '7h' ? 'actif' : ''}">Salle à 7h</button>
        <button type="button" data-action="creneau" data-c="17h" class="${c === '17h' ? 'actif' : ''}">Salle à 17h</button>
      </div>`;
  }

  html += `
    <div class="carte carte-principale">
      <p class="etiquette">${esc(scenario.titre)}</p>
      <h2>${esc(nomSeance || (sc.id === 'foot_seul' ? 'Foot' : 'Repos'))}</h2>
      ${scenario.conseil ? `<p class="info">${esc(scenario.conseil)}</p>` : ''}
    </div>`;

  if (decalage === 0) {
    const eau = suivi.eau || 0;
    const pct = Math.min(100, (eau / eauCible) * 100);
    html += `
      <div class="carte">
        <div class="suivi-ligne">
          <div>
            <p class="etiquette">Eau</p>
            <p class="suivi-valeur"><strong>${fmtL(eau)}</strong> / ${fmtL(eauCible)}</p>
          </div>
          <div class="suivi-boutons">
            <button type="button" data-action="eau" data-ml="-250" aria-label="Retirer 250 mL">−</button>
            <button type="button" data-action="eau" data-ml="250">+25 cL</button>
            <button type="button" data-action="eau" data-ml="500" class="principal">+50 cL</button>
          </div>
        </div>
        <div class="jauge"><div style="width:${pct}%"></div></div>
        <button type="button" data-action="creatine" class="creatine ${suivi.creatine ? 'prise' : ''}">
          <span class="coche">${suivi.creatine ? '✓' : ''}</span>
          <span>${suivi.creatine ? 'Créatine prise' : 'Créatine (3-5 g) à prendre'}</span>
        </button>
      </div>`;
  }

  html += `<h3 class="section-titre">Déroulé de la journée</h3><ol class="frise">`;
  for (const e of scenario.etapes) {
    const titre = e.titre.replace('{seance}', nomSeance || 'Séance');
    html += `
      <li class="frise-${e.type} ${e === prochaine ? 'prochaine' : ''}">
        <span class="frise-heure">${esc(e.heure)}</span>
        <span class="frise-point" aria-hidden="true">${ICONES[e.type] || '•'}</span>
        <div class="frise-texte">
          ${e === prochaine ? '<span class="frise-badge">À venir</span>' : ''}
          <strong>${esc(titre)}</strong>
          <p>${esc(e.detail)}</p>
        </div>
      </li>`;
  }
  html += `</ol>`;

  html += `
    <h3 class="section-titre">Objectifs du jour</h3>
    <div class="carte objectifs">
      <div><span>Protéines</span><strong>${esc(obj.proteines)}</strong></div>
      <div><span>Calories</span><strong>${esc(obj.calories)}</strong></div>
      <div><span>Lipides</span><strong>${esc(obj.lipides)}</strong></div>
      <div><span>Eau</span><strong>${fmtL(eauCible)}</strong></div>
      <div><span>Créatine</span><strong>${esc(obj.creatine)}</strong></div>
    </div>

    <h3 class="section-titre">Idées de collations</h3>
    ${nutrition.collations
      .map(
        (c) => `
      <div class="carte collation">
        <strong>${esc(c.nom)}</strong>
        <p class="tags">${c.moments.map((m) => `<span>${esc(m)}</span>`).join('')}</p>
        <p class="macros">≈ <b>${c.p} g</b> prot · ${c.g} g gluc · ${c.l} g lip · ${c.kcal} kcal</p>
      </div>`
      )
      .join('')}
    <p class="info" style="text-align:center;margin-top:16px">Bientôt : journal des macros façon Yazio.</p>`;

  return html;
}
