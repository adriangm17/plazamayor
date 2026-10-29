/* ===== UTILIDADES GENERALES (sin estado) ===== */
const GRADES = ['M', 'F', 'VF', 'XF', 'AU', 'UNC'];
const RARITIES = ['A', 'B', 'C', 'R', 'RR', 'RRR', 'RRR*', 'UR', 'PLATA'];
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

function parseTags(str) {
  if (!str) return [];
  return [...new Set(str.split(/[\s,]+/).map(t => {
    t = t.trim();
    if (!t) return '';
    return t.startsWith('#') ? t.toUpperCase() : '#' + t.toUpperCase();
  }).filter(Boolean))];
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
