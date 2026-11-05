// Carte des muscles : silhouette de face et de dos, muscles ciblés colorés.
// Les ids des muscles sont ceux utilisés dans programme.json (champ "cibles").

export const NOMS_MUSCLES = {
  pectoraux: 'Pectoraux',
  epaules_avant: "Avant d'épaule",
  epaules_milieu: "Milieu d'épaule",
  arriere_epaule: "Arrière d'épaule",
  biceps: 'Biceps',
  triceps: 'Triceps',
  avant_bras: 'Avant-bras',
  abdos: 'Abdos',
  trapezes: 'Trapèzes',
  haut_dos: 'Haut du dos',
  dorsaux: 'Grands dorsaux',
  lombaires: 'Lombaires',
  fessiers: 'Fessiers',
  quadriceps: 'Quadriceps',
  ischios: 'Ischio-jambiers',
  mollets: 'Mollets',
};

// Formes communes aux deux vues (parties non musculaires).
const CORPS = `
  <ellipse cx="50" cy="13" rx="8" ry="10"/>
  <rect x="45.5" y="21" width="9" height="9" rx="2"/>
  <path d="M35,30 L65,30 L67,52 L63,84 L37,84 L33,52 Z"/>
  <path d="M37,82 L63,82 L65,96 L50,102 L35,96 Z"/>
  <path d="M27,32 L36,32 L34,64 L24,64 Z"/><path d="M73,32 L64,32 L66,64 L76,64 Z"/>
  <circle cx="24.5" cy="92" r="3.6"/><circle cx="75.5" cy="92" r="3.6"/>
  <ellipse cx="43" cy="133" rx="5.2" ry="4.5"/><ellipse cx="57" cy="133" rx="5.2" ry="4.5"/>
  <rect x="39.5" y="136" width="7" height="40" rx="3"/><rect x="53.5" y="136" width="7" height="40" rx="3"/>
  <ellipse cx="42.5" cy="178" rx="5.5" ry="3.2"/><ellipse cx="57.5" cy="178" rx="5.5" ry="3.2"/>`;

// [muscle, forme SVG] pour chaque vue. L'ordre compte : les dernières passent par-dessus.
const FACE = [
  ['abdos', '<rect x="43" y="51" width="14" height="29" rx="4"/>'],
  ['epaules_milieu', '<ellipse cx="28.8" cy="37.5" rx="3.6" ry="6.8"/><ellipse cx="71.2" cy="37.5" rx="3.6" ry="6.8"/>'],
  ['epaules_avant', '<ellipse cx="34.5" cy="35" rx="6" ry="6.8"/><ellipse cx="65.5" cy="35" rx="6" ry="6.8"/>'],
  ['pectoraux', '<path d="M49.2,31 L38.5,32.5 Q34.5,40 37,47 Q43,50.8 49.2,49.2 Z"/><path d="M50.8,31 L61.5,32.5 Q65.5,40 63,47 Q57,50.8 50.8,49.2 Z"/>'],
  ['biceps', '<ellipse cx="29.3" cy="53" rx="4.6" ry="10"/><ellipse cx="70.7" cy="53" rx="4.6" ry="10"/>'],
  ['avant_bras', '<ellipse cx="26.5" cy="75" rx="4.2" ry="11.5"/><ellipse cx="73.5" cy="75" rx="4.2" ry="11.5"/>'],
  ['quadriceps', '<path d="M37,99 Q35.5,113 39,128 L47.5,128 Q49.8,113 49,101 Z"/><path d="M63,99 Q64.5,113 61,128 L52.5,128 Q50.2,113 51,101 Z"/>'],
  ['mollets', '<ellipse cx="42.6" cy="152" rx="4.2" ry="14.5"/><ellipse cx="57.4" cy="152" rx="4.2" ry="14.5"/>'],
];

const DOS = [
  ['lombaires', '<path d="M46.2,56 L53.8,56 L54,79 L46,79 Z"/>'],
  ['dorsaux', '<path d="M42.8,36 L36.5,39 Q34.5,51 38.8,63 L45.8,71 L45.2,56 L42.8,48 Z"/><path d="M57.2,36 L63.5,39 Q65.5,51 61.2,63 L54.2,71 L54.8,56 L57.2,48 Z"/>'],
  ['haut_dos', '<path d="M44,34.5 L56,34.5 L57,47 L50,52.5 L43,47 Z"/>'],
  ['trapezes', '<path d="M50,21.5 L37.5,31 L44,34 L56,34 L62.5,31 Z"/>'],
  ['epaules_milieu', '<ellipse cx="28.8" cy="37.5" rx="3.6" ry="6.8"/><ellipse cx="71.2" cy="37.5" rx="3.6" ry="6.8"/>'],
  ['arriere_epaule', '<ellipse cx="34.5" cy="35" rx="6" ry="6.8"/><ellipse cx="65.5" cy="35" rx="6" ry="6.8"/>'],
  ['triceps', '<ellipse cx="29.3" cy="53" rx="4.6" ry="10"/><ellipse cx="70.7" cy="53" rx="4.6" ry="10"/>'],
  ['avant_bras', '<ellipse cx="26.5" cy="75" rx="4.2" ry="11.5"/><ellipse cx="73.5" cy="75" rx="4.2" ry="11.5"/>'],
  ['fessiers', '<ellipse cx="44" cy="90" rx="7" ry="8.5"/><ellipse cx="56" cy="90" rx="7" ry="8.5"/>'],
  ['ischios', '<path d="M37.5,100 Q36,114 39.5,128 L47.5,128 Q49.8,114 49,101 Z"/><path d="M62.5,100 Q64,114 60.5,128 L52.5,128 Q50.2,114 51,101 Z"/>'],
  ['mollets', '<ellipse cx="42.6" cy="150" rx="5.4" ry="14"/><ellipse cx="57.4" cy="150" rx="5.4" ry="14"/>'],
];

function vue(formes, principal, secondaire, dx) {
  const classe = (m) => (principal.includes(m) ? 'm p' : secondaire.includes(m) ? 'm s' : 'm');
  return `<g transform="translate(${dx},0)">
    <g class="corps">${CORPS}</g>
    ${formes.map(([m, f]) => `<g class="${classe(m)}">${f}</g>`).join('')}
  </g>`;
}

/**
 * @param {{principal?: string[], secondaire?: string[]}} cibles
 * @param {{legendes?: boolean}} options  legendes : affiche « Face » / « Dos » sous les silhouettes
 */
export function carteMuscles(cibles = {}, { legendes = false } = {}) {
  const p = cibles.principal || [];
  const s = cibles.secondaire || [];
  const noms = [...p, ...s].map((m) => NOMS_MUSCLES[m] || m).join(', ');
  const h = legendes ? 196 : 184;
  return `<svg class="carte-muscles" viewBox="0 0 206 ${h}" role="img" aria-label="Muscles travaillés : ${noms}">
    ${vue(FACE, p, s, 0)}
    ${vue(DOS, p, s, 106)}
    ${legendes ? '<text x="50" y="194" text-anchor="middle">Face</text><text x="156" y="194" text-anchor="middle">Dos</text>' : ''}
  </svg>`;
}

// Liste lisible « Pectoraux · Avant d'épaule (secondaire) ».
export function texteMuscles(cibles = {}) {
  const p = (cibles.principal || []).map((m) => NOMS_MUSCLES[m] || m);
  const s = (cibles.secondaire || []).map((m) => NOMS_MUSCLES[m] || m);
  return { principal: p.join(', '), secondaire: s.join(', ') };
}
