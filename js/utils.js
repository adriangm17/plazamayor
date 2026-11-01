/* ===== UTILIDADES GENERALES (sin estado) ===== */
const GRADES = ['TBD', 'F', 'VF', 'XF', 'AU', 'UNC'];   // de peor a mejor
/* Formato del ejemplar (solo icono, sin texto). El primero es el valor por defecto.
   Iconos esquemáticos 24×24, trazo de 1.5 con currentColor, para que cuadren con el resto de la interfaz. */
const ITEM_FORMATS = [
  { id: 'carton',   label: 'Encartonada',  svg: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><circle cx="12" cy="12" r="4.6"/><path d="M3.5 12h3M17.5 12h3" stroke-dasharray="0"/>' },
  { id: 'serie',    label: 'Serie anual',  svg: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="7" cy="12" r="3"/><circle cx="13.2" cy="12" r="2.3"/><circle cx="18.3" cy="12" r="1.7"/>' },
  { id: 'capsula',  label: 'Encapsulada',  svg: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5.8"/><path d="M6.2 5.2a9 9 0 0 1 3-1.5"/>' },
  { id: 'coincard', label: 'Coincard',     svg: '<rect x="6" y="2.5" width="12" height="19" rx="1.5"/><circle cx="12" cy="9.5" r="3.5"/><path d="M9 16.2h6M9.8 18.7h4.4"/>' }
];
const DEFAULT_ITEM_FORMAT = ITEM_FORMATS[0].id;
function itemFormatIcon(id, size) {
  const f = ITEM_FORMATS.find(x => x.id === id) || ITEM_FORMATS[0];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${f.svg}</svg>`;
}
const RARITIES =['A', 'B', 'C', 'R', 'RR', 'RRR', 'RRR*', 'UR', 'PLATA'];
// Tipo de moneda (solo se edita desde "Editar ficha"). Circulante es el valor por defecto y no lleva marca en las tarjetas.
const COIN_TYPES = ['Circulante', 'Conmemorativas', 'Colección', 'Falsas de época'];
const DEFAULT_COIN_TYPE = 'Circulante';
const COIN_TYPE_COLORS = { 'Circulante': '#45bbff', 'Conmemorativas': '#efde97', 'Colección': '#ff85d0', 'Falsas de época': '#aea0a0' };
function coinType(c) { return (c && COIN_TYPES.includes(c.type)) ? c.type : DEFAULT_COIN_TYPE; }
function coinTypeChipStyle(t) { return `background-color: ${COIN_TYPE_COLORS[t] || COIN_TYPE_COLORS[DEFAULT_COIN_TYPE]}; color: #0f172a;`; }

const IMG_MAX_DIM = 300;
const IMG_QUALITY = 0.75;
const WHITE_BG_TOLERANCE = 30;

function newId() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString() + '-' + Math.floor(Math.random() * 1e9);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function jsArg(s) {
  return esc(String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

function normName(s) {
  return String(s ?? '').trim().toLowerCase();
}

// Mejor estado entre los ejemplares de una ficha ('' si ninguno tiene estado reconocido)
function bestGrade(c) {
  let best = -1;
  (Array.isArray(c && c.items) ? c.items : []).forEach(i => { const k = GRADES.indexOf(String((i && i.grade) || '').trim()); if (k > best) best = k; });
  return best >= 0 ? GRADES[best] : '';
}

function isSilverCoin(c) {
  return Boolean(c.rarity && c.rarity.trim().toUpperCase() === 'PLATA');
}

function getRarityStyle(rarityStr) {
  if (!rarityStr) return 'background-color: #1e293b; color: #ffffff;';
  const cleanRarity = rarityStr.trim().toUpperCase();
  const colors = {
    'A': 'background-color: #00bf63; color: #ffffff;',
    'B': 'background-color: #5bb336; color: #ffffff;',
    'C': 'background-color: #8ac926; color: #ffffff;',
    'R': 'background-color: #ffde59; color: #0f172a;',
    'RR': 'background-color: #ffbd59; color: #0f172a;',
    'RRR': 'background-color: #ff914d; color: #0f172a;',
    'RRR*': 'background-color: #e2a9f1; color: #0f172a;',
    'UR': 'background-color: #ff5757; color: #ffffff;',
    'PLATA': 'background-color: #64748b; color: #ffffff;'
  };
  return colors[cleanRarity] || 'background-color: #1e293b; color: #ffffff;';
}

function formatYearRange(rangeStr) {
  if (!rangeStr) return 'S/F';
  const cleanStr = rangeStr.trim();
  const matches = cleanStr.match(/\d{4}/g);
  if (matches && matches.length >= 2) {
    const startYear = parseInt(matches[0]);
    const endYear = parseInt(matches[1]);
    if (endYear >= new Date().getFullYear() || cleanStr.toUpperCase().includes('ACT')) {
      return `${startYear}–ACT.`;
    }
  }
  return cleanStr;
}

function parseYearRange(rangeStr) {
  if (!rangeStr) return null;
  const now = new Date().getFullYear();
  const matches = rangeStr.match(/\d{4}/g);
  if (matches && matches.length >= 2) {
    return { min: parseInt(matches[0]), max: Math.min(now, parseInt(matches[1])) };
  } else if (matches && matches.length === 1) {
    const start = parseInt(matches[0]);
    return { min: start, max: rangeStr.toUpperCase().includes('ACT') ? now : start };
  }
  return null;   // "S/F" u otro texto sin años: no hay rango que aplicar
}

function renderDualProgressBar(normalPct, silverPct, hasSilver) {
  if (hasSilver) {
    return `
      <div class="flex items-center gap-1.5 w-full h-1.5 mt-1.5">
        <div class="w-[75%] bg-slate-900 rounded-full h-full overflow-hidden border border-slate-800 relative">
          <div class="bg-amber-500 h-full rounded-full transition-all duration-300" style="width: ${normalPct}%;"></div>
        </div>
        <div class="w-[25%] bg-slate-900 rounded-full h-full overflow-hidden border border-slate-800 relative" title="Monedas de Plata">
          <div class="silver-gradient-fill h-full rounded-full transition-all duration-300" style="width: ${silverPct}%;"></div>
        </div>
      </div>
    `;
  }
  return `
    <div class="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800 relative mt-1.5">
      <div class="bg-amber-500 h-full rounded-full transition-all duration-300" style="width: ${normalPct}%;"></div>
    </div>
  `;
}
