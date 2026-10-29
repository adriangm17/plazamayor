/* ===== ESTADO Y MODELO DE DATOS =====
   country: { id, name, tags[], order }
   period : { id, countryId, name, tags[], order, collapsed, sortMode }
   coin   : { id, countryId, periodId, denom, ... }
   Renombrar un país o período solo cambia su `name`: nada más depende del nombre. */
let coins = [];
let countries = [];
let periods = [];

let currentCountryId = null;
let currentTab = 'indice';   // la app siempre arranca en el Índice
let albumPeriodId = '';      // período elegido en las pestañas del Álbum ('' = todos)
let activeCoinId = null;
let movingCoinId = null;
let indiceCollapsedCountries = {};   // por id de país; sin valor = contraído por defecto
let indiceSearchText = '';
let selectedTagFilter = '';
let albumSearch = '';
let albumOnlyMissing = false;

/* ----- Búsquedas ----- */
const countryById = id => countries.find(c => c.id === id);
const periodById = id => periods.find(p => p.id === id);
function sortedCountries() { return [...countries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
function periodsOfCountry(countryId) { return periods.filter(p => p.countryId === countryId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
function coinsOfPeriod(periodId) { return coins.filter(c => c.periodId === periodId); }
function coinsOfCountry(countryId) { return coins.filter(c => c.countryId === countryId); }
function findCountryByName(name) { const n = normName(name); return countries.find(c => normName(c.name) === n); }
function findPeriodByName(countryId, name) { const n = normName(name); return periods.find(p => p.countryId === countryId && normName(p.name) === n); }

function getOrCreateCountry(name) {
  name = String(name ?? '').trim() || 'Sin país';
  let c = findCountryByName(name);
  if (!c) {
    c = { id: newId(), name, tags: [], order: countries.reduce((m, x) => Math.max(m, x.order ?? 0), -1) + 1 };
    countries.push(c);
  }
  return c;
}

function getOrCreatePeriod(countryId, name) {
  name = String(name ?? '').trim() || 'General';
  let p = findPeriodByName(countryId, name);
  if (!p) {
    const mine = periodsOfCountry(countryId);
    p = { id: newId(), countryId, name, tags: [], order: mine.reduce((m, x) => Math.max(m, x.order ?? 0), -1) + 1, collapsed: false, sortMode: 'default' };
    periods.push(p);
  }
  return p;
}

function nextCoinOrder(periodId) {
  const list = coinsOfPeriod(periodId);
  return list.length > 0 ? Math.max(...list.map(c => c.order ?? 0)) + 1 : 0;
}

// Elimina períodos sin monedas y países sin períodos. Devuelve true si cambió algo.
function pruneEmpty() {
  const before = periods.length + countries.length;
  const used = new Set(coins.map(c => c.periodId));
  periods = periods.filter(p => used.has(p.id));
  const usedCountries = new Set(periods.map(p => p.countryId));
  countries = countries.filter(c => usedCountries.has(c.id));
  return periods.length + countries.length !== before;
}

function getPeriodWithDate(periodId) {
  const list = coinsOfPeriod(periodId);
  if (list.length === 0) return '';
  let minYear = Infinity, maxYear = -Infinity, hasAct = false;
  const explicit = [];
  list.forEach(c => {
    if (!c.range) return;
    const s = c.range.trim();
    if (s.toUpperCase().includes('ACT')) hasAct = true;
    const m = s.match(/\d{4}/g);
    if (m) {
      m.forEach(y => { const yr = parseInt(y, 10); if (yr < minYear) minYear = yr; if (yr > maxYear) maxYear = yr; });
    } else if (s && s !== 'S/F') explicit.push(s);
  });
  if (minYear !== Infinity) {
    if (hasAct || maxYear >= new Date().getFullYear()) return `${minYear}–ACT.`;
    return minYear === maxYear ? `${minYear}` : `${minYear}–${maxYear}`;
  }
  return explicit[0] || '';
}

function periodDisplayName(p) {
  const name = p.name.trim();
  const date = getPeriodWithDate(p.id);
  return /\([\d\s–-]+\)/.test(name) ? name : (date ? `${name} (${date})` : name);
}

/* ----- Persistencia ----- */
async function saveCoins(changed) {
  coins.forEach(c => { c.acquired = Boolean(c.grade && c.grade.trim() !== ''); });
  let list = coins;
  if (changed) list = Array.isArray(changed) ? changed : [changed];
  try { await putCoinsToDB(list); } catch (err) { console.error('Error guardando en BD:', err); }
  render();
}

async function persistMeta() {
  try { await putMetaToDB(countries, periods); } catch (err) { console.error('Error guardando países/períodos:', err); }
}

/* ----- Migración desde el formato antiguo (nombres como clave) ----- */
function safeParseStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : fallback;
  } catch (e) { return fallback; }
}

function readLegacyPrefs() {
  return {
    periodOrders: safeParseStorage('numis_period_orders', {}),
    collapsedPeriods: safeParseStorage('numis_collapsed_periods', {}),
    periodSortModes: safeParseStorage('numis_period_sort_modes', {}),
    countryTags: safeParseStorage('numis_country_tags', {}),
    periodTags: safeParseStorage('numis_period_tags', {})
  };
}

// Convierte monedas con country/period (texto) + preferencias antiguas en el modelo con ids.
function migrateLegacy(rawCoins, prefs) {
  prefs = prefs || {};
  const orders = prefs.periodOrders || {}, collapsed = prefs.collapsedPeriods || {}, sortModes = prefs.periodSortModes || {};
  const cTags = prefs.countryTags || {}, pTags = prefs.periodTags || {};
  const outCountries = [], outPeriods = [];
  const cMap = new Map(), pMap = new Map();
  const cName = c => String(c.country ?? '').trim() || 'Sin país';
  const pName = c => String(c.period ?? '').trim() || 'General';

  rawCoins.forEach(c => {
    const cn = cName(c);
    if (!cMap.has(cn)) {
      const o = { id: newId(), name: cn, tags: Array.isArray(cTags[cn]) ? cTags[cn].slice() : [], order: outCountries.length };
      cMap.set(cn, o); outCountries.push(o);
    }
  });
  cMap.forEach((country, cn) => {
    const natural = [...new Set(rawCoins.filter(c => cName(c) === cn).map(pName))];
    const preferred = (Array.isArray(orders[cn]) ? orders[cn] : []).filter(p => natural.includes(p));
    const ordered = preferred.concat(natural.filter(p => !preferred.includes(p)));
    ordered.forEach((pn, i) => {
      const key = `${cn}_${pn}`;
      const p = { id: newId(), countryId: country.id, name: pn, tags: Array.isArray(pTags[key]) ? pTags[key].slice() : [], order: i, collapsed: !!collapsed[key], sortMode: sortModes[key] || 'default' };
      pMap.set(key, p); outPeriods.push(p);
    });
  });
  rawCoins.forEach(c => {
    c.countryId = cMap.get(cName(c)).id;
    c.periodId = pMap.get(`${cName(c)}_${pName(c)}`).id;
    delete c.country; delete c.period;
  });
  return { coins: rawCoins, countries: outCountries, periods: outPeriods };
}

// Arregla monedas con referencias rotas (copias a medias, datos mezclados). true si cambió algo.
function repairReferences() {
  let changed = false;
  coins.forEach(c => {
    const p = periodById(c.periodId);
    if (p && c.countryId !== p.countryId) { c.countryId = p.countryId; changed = true; }
    if (!countryById(c.countryId) || !p) {
      const country = getOrCreateCountry(c.country);
      const period = getOrCreatePeriod(country.id, c.period);
      c.countryId = country.id; c.periodId = period.id; changed = true;
    }
    if ('country' in c || 'period' in c) { delete c.country; delete c.period; changed = true; }
  });
  countries.forEach(c => { if (!Array.isArray(c.tags)) c.tags = []; });
  periods.forEach(p => { if (!Array.isArray(p.tags)) p.tags = []; if (!p.sortMode) p.sortMode = 'default'; });
  return changed;
}

/* ----- Carga inicial ----- */
const DEFAULT_LEGACY_PREFS = {
  countryTags: { 'España': ['#EUROPA', '#EURO', '#IBARES'], 'Francia': ['#EUROPA', '#EURO'], 'Alemania': ['#EUROPA', '#EURO'] }
};
const defaultInitialCoins = [
  { id: '1', country: 'España', period: 'Alfonso XII', denom: '25 ptas', cecaMaterial: 'Variante A', rarity: 'RR', range: '1876-1885', km: 'KM# 673', numistaUrl: '', ucoinUrl: '', acquired: true, year: '1876', grade: 'VF', hasFront: false, hasBack: false, order: 0, silverWeight: '', silverPurity: '900' },
  { id: '2', country: 'España', period: 'Alfonso XII', denom: '5 ptas', cecaMaterial: '', rarity: 'PLATA', range: '1875-1885', km: 'KM# 671', numistaUrl: '', ucoinUrl: '', acquired: true, year: '1878', grade: 'AU', hasFront: false, hasBack: false, order: 1, silverWeight: '25.0', silverPurity: '900' },
  { id: '3', country: 'España', period: 'Alfonso XII', denom: '1 pta', cecaMaterial: 'Variante A', rarity: 'PLATA', range: '1876-1885', km: 'KM# 669', numistaUrl: '', ucoinUrl: '', acquired: false, year: '', grade: '', hasFront: false, hasBack: false, order: 2, silverWeight: '5.0', silverPurity: '835' },
  { id: '4', country: 'Francia', period: 'Segundo Imperio', denom: '1 fr', cecaMaterial: 'Variante C', rarity: 'C', range: '1852–1870', km: 'KM# 781', numistaUrl: '', ucoinUrl: '', acquired: true, year: '1858', grade: 'XF', hasFront: false, hasBack: false, order: 0, silverWeight: '', silverPurity: '900' },
  { id: '5', country: 'Francia', period: 'Segundo Imperio', denom: '50 cent', cecaMaterial: '', rarity: 'PLATA', range: '1852–1870', km: 'KM# 780', numistaUrl: '', ucoinUrl: '', acquired: true, year: '1864', grade: 'VF', hasFront: false, hasBack: false, order: 1, silverWeight: '2.5', silverPurity: '835' },
  { id: '6', country: 'Francia', period: 'Tercera República', denom: '2 fr', cecaMaterial: 'Variante B', rarity: 'R', range: '1870–2050', km: 'KM# 845', numistaUrl: '', ucoinUrl: '', acquired: false, year: '', grade: '', hasFront: false, hasBack: false, order: 0, silverWeight: '', silverPurity: '900' },
  { id: '7', country: 'Alemania', period: 'Imperio Alemán', denom: '1 Mark', cecaMaterial: 'Variante A', rarity: 'PLATA', range: '1873–1916', km: 'KM# 14', numistaUrl: '', ucoinUrl: '', acquired: true, year: '1905', grade: 'UNC', hasFront: false, hasBack: false, order: 0, silverWeight: '5.55', silverPurity: '900' },
  { id: '8', country: 'Alemania', period: 'Imperio Alemán', denom: '2 Mark', cecaMaterial: '', rarity: 'RR', range: '1876–1915', km: 'KM# 18', numistaUrl: '', ucoinUrl: '', acquired: false, year: '', grade: '', hasFront: false, hasBack: false, order: 1, silverWeight: '', silverPurity: '900' }
];

function normalizeCoins() {
  const counters = {};
  coins.forEach(c => {
    c.acquired = Boolean(c.grade && c.grade.trim() !== '');
    if (!c.numistaUrl) c.numistaUrl = '';
    if (!c.ucoinUrl) c.ucoinUrl = '';
    if (c.silverWeight === undefined) c.silverWeight = '';
    if (c.silverPurity === undefined) c.silverPurity = '900';
    if (c.order === undefined || c.order === null) {
      if (counters[c.periodId] === undefined) counters[c.periodId] = 0;
      c.order = counters[c.periodId]++;
    }
  });
}

async function loadData() {
  await initDB();
  coins = await getAllFromStore('coins');
  countries = await getAllFromStore('countries');
  periods = await getAllFromStore('periods');

  let seeded = false;
  try { seeded = localStorage.getItem('numis_seeded') === '1'; } catch (e) {}
  let prefs = null, needSave = false;

  if (coins.length === 0 && countries.length === 0 && !seeded) {
    coins = JSON.parse(JSON.stringify(defaultInitialCoins));
    prefs = DEFAULT_LEGACY_PREFS;
    needSave = true;
  }
  try { localStorage.setItem('numis_seeded', '1'); } catch (e) {}
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  await migrateImages(coins);

  if (coins.length > 0 && countries.length === 0) {
    const res = migrateLegacy(coins, prefs || readLegacyPrefs());
    coins = res.coins; countries = res.countries; periods = res.periods;
    needSave = true;
  }
  if (repairReferences()) needSave = true;
  normalizeCoins();

  if (needSave) {
    try { await saveAllDataToDB({ coins, countries, periods }); }
    catch (err) { console.error('Error guardando migración:', err); alert('No se pudo guardar la migración de datos.'); }
  }

  if (!countryById(currentCountryId)) {
    const first = sortedCountries()[0];
    currentCountryId = first ? first.id : null;
  }
  render();
  fetchSilverPrice();
}
