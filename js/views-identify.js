/* ===== PESTAÑA IDENTIFICACIÓN =====
   Foto (móvil) o imagen subida (ordenador) → Gemini (capa gratuita de Google AI Studio, llamada directa desde el navegador,
   sin servidor propio) devuelve país / valor / unidad / año → el cruce con el catálogo se hace aquí, en local.
   Resultado: LA TENGO · NO LA TENGO (ficha del catálogo) · NO ESTÁ EN EL CATÁLOGO (+ "varias posibles" cuando la foto no basta).
   El año NO hace falta que coincida con el de tu ejemplar: se compara el tipo/diseño (país + valor + serie por rango de años).
   La clave de Gemini y los modelos se guardan solo en este dispositivo (localStorage); no entran en las copias de seguridad. */
const IDENT_KEY_LS = 'plaza-gemini-key';
const IDENT_MODELS_LS = 'plaza-gemini-models';
const IDENT_USAGE_LS = 'plaza-gemini-usage';
// Los modelos de Google cambian a menudo: se prueban por orden y se pueden editar o detectar desde la propia pestaña
const IDENT_DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
const IDENT_API = 'https://generativelanguage.googleapis.com/v1beta/';
const IDENT_MAX_DIM = 1024;   // lado mayor de la foto enviada (suficiente para leer la moneda y ligera)

let identPhotos = [];        // [{ src (dataURL de vista previa), b64, mime }] · máx. 2 (anverso y reverso)
let identBusy = false, identBusyMsg = '';
let identExtract = null;     // lo que Gemini (o la búsqueda manual) ha leído de la moneda
let identRefine = null;      // resultado de "afinar con las imágenes del catálogo"
let identError = '';
let identBuilt = false;
let identManualText = '';

/* ----- Almacenamiento local (todo con try/catch: puede estar bloqueado) ----- */
function identLsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function identLsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
function identKey() { return identLsGet(IDENT_KEY_LS).trim(); }
function identModels() {
  const l = identLsGet(IDENT_MODELS_LS).split(/[\s,;]+/).map(s => s.replace(/^models\//, '').trim()).filter(Boolean);
  return l.length ? l : IDENT_DEFAULT_MODELS.slice();
}
function identTodayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function identUsageToday() {
  try { const u = JSON.parse(identLsGet(IDENT_USAGE_LS) || '{}'); return u.d === identTodayKey() ? (u.n || 0) : 0; } catch (e) { return 0; }
}
function identBumpUsage() { identLsSet(IDENT_USAGE_LS, JSON.stringify({ d: identTodayKey(), n: identUsageToday() + 1 })); }

/* =====================================================================
   1) NORMALIZACIÓN Y CRUCE CON EL CATÁLOGO (sin red, probado contra todo el catálogo)
   ===================================================================== */
function identNorm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’`´]/g, '').replace(/[^a-z0-9\/½¼¾⅓⅔⅛.,\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Nombres de país en inglés (o variantes) → nombre en español normalizado, tal como suele escribirse en el catálogo
const IDENT_COUNTRY_ALIASES = {
  'fiji': 'fiyi', 'republic of fiji': 'fiyi', 'new zealand': 'nueva zelanda', 'aotearoa': 'nueva zelanda', 'cook islands': 'islas cook', 'cook island': 'islas cook',
  'luxembourg': 'luxemburgo', 'moldova': 'moldavia', 'republic of moldova': 'moldavia', 'suriname': 'surinam', 'republic of suriname': 'surinam',
  'afghanistan': 'afganistan', 'nagorno karabakh': 'nagorno karabaj', 'nagorno karabagh': 'nagorno karabaj', 'artsakh': 'nagorno karabaj', 'republic of artsakh': 'nagorno karabaj',
  'western samoa': 'samoa', 'independent state of samoa': 'samoa', 'kingdom of tonga': 'tonga', 'cooperative republic of guyana': 'guyana', 'plurinational state of bolivia': 'bolivia',
  'united states': 'estados unidos', 'united states of america': 'estados unidos', 'united kingdom': 'reino unido', 'great britain': 'reino unido', 'germany': 'alemania',
  'france': 'francia', 'italy': 'italia', 'spain': 'espana', 'portugal': 'portugal', 'netherlands': 'paises bajos', 'holland': 'paises bajos', 'belgium': 'belgica',
  'switzerland': 'suiza', 'ireland': 'irlanda', 'canada': 'canada', 'mexico': 'mexico', 'japan': 'japon', 'china': 'china', 'russia': 'rusia', 'brazil': 'brasil',
  'peru': 'peru', 'colombia': 'colombia', 'cuba': 'cuba', 'poland': 'polonia', 'hungary': 'hungria', 'czech republic': 'republica checa', 'turkey': 'turquia',
  'greece': 'grecia', 'sweden': 'suecia', 'norway': 'noruega', 'denmark': 'dinamarca', 'finland': 'finlandia', 'south africa': 'sudafrica', 'egypt': 'egipto',
  'israel': 'israel', 'thailand': 'tailandia', 'malaysia': 'malasia', 'singapore': 'singapur', 'indonesia': 'indonesia', 'philippines': 'filipinas',
  'papua new guinea': 'papua nueva guinea', 'solomon islands': 'islas salomon', 'ethiopia': 'etiopia', 'kenya': 'kenia', 'morocco': 'marruecos', 'tunisia': 'tunez',
  'algeria': 'argelia', 'india': 'india', 'pakistan': 'pakistan', 'iran': 'iran', 'iraq': 'irak', 'syria': 'siria', 'lebanon': 'libano', 'jordan': 'jordania',
  'ussr': 'urss', 'soviet union': 'urss', 'czechoslovakia': 'checoslovaquia', 'yugoslavia': 'yugoslavia', 'east germany': 'rda', 'west germany': 'alemania occidental'
};
const IDENT_STOP = new Set(['the', 'and', 'for', 'from', 'with', 'coin', 'moneda', 'silver', 'plata', 'serie', 'series']);

function identIso(n) { return (typeof flagLookup === 'function' && flagLookup(n).code) || ''; }
function identFindCountry(name) {
  const n0 = identNorm(name);
  if (!n0) return null;
  const n = IDENT_COUNTRY_ALIASES[n0] || n0;
  let best = null, bestScore = 0;
  countries.forEach(c => {
    const cn = identNorm(c.name);
    let s = 0;
    if (cn === n) s = 100;
    else if (n.length >= 4 && cn.length >= 4 && (n.includes(cn) || cn.includes(n))) s = 50 + Math.min(cn.length, n.length);
    else { const a = identIso(n), b = (typeof flagCode === 'function' ? flagCode(c) : '') || identIso(cn); if (a && a === b) s = 40; }
    if (s > bestScore) { best = c; bestScore = s; }
  });
  return best;
}

/* Valor facial: "25", "1/2", "1 1/2", "½", "0,5", "1.000" → número */
function identParseValue(str) {
  const s = String(str ?? '').replace(/ /g, ' ').trim();
  const UF = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
  let m = s.match(/(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (m && +m[3]) return +m[1] + (+m[2]) / (+m[3]);
  m = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (m && +m[2]) return (+m[1]) / (+m[2]);
  m = s.match(/(\d+)?\s*([½¼¾⅓⅔⅛])/);
  if (m) return (m[1] ? +m[1] : 0) + UF[m[2]];
  m = s.match(/\d{1,3}(?:[.,]\d{3})+(?!\d)/);
  if (m) return parseFloat(m[0].replace(/[.,]/g, ''));
  m = s.match(/\d+(?:[.,]\d+)?/);
  if (m) return parseFloat(m[0].replace(',', '.'));
  const w = identNorm(s).split(' ')[0];
  const W = { un: 1, una: 1, uno: 1, one: 1, dos: 2, two: 2, tres: 3, three: 3, cinco: 5, five: 5, diez: 10, ten: 10, medio: 0.5, half: 0.5 };
  return W[w] || null;
}

/* Unidad monetaria → claves comparables (cents/centavos/centesimi son "familia" cent) */
const IDENT_UNIT_SYN = { pence: 'penny', pennies: 'penny', pences: 'penny', dolar: 'dollar', dolares: 'dollar', cts: 'cent', ct: 'cent', c: 'cent', centesimi: 'centesimo', centimes: 'centime', centimos: 'centimo' };
const IDENT_UNIT_STOP = new Set(['de', 'of', 'the', 'y', 'and', 'la', 'el', 'plata', 'silver', 'ag', 'coin', 'moneda']);
function identUnitKeys(text) {
  const out = [];
  identNorm(String(text ?? '').replace(/[\d½¼¾⅓⅔⅛\/.,]+/g, ' ')).split(' ').forEach(w => {
    if (!w || IDENT_UNIT_STOP.has(w) || /^[ivx]+$/.test(w)) return;
    let k = IDENT_UNIT_SYN[w] || (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
    k = IDENT_UNIT_SYN[k] || k;
    if (!out.includes(k)) out.push(k);
  });
  return out;
}
const identFamily = k => (k.startsWith('cent') ? 'cent' : k);

// Valor y unidad de una ficha del catálogo ("2 Dollars · 4to retrato" → 2, ['dollar'])
const _identDenomCache = new Map();
function identCoinDenom(c) {
  const d = String(c.denom ?? '');
  let r = _identDenomCache.get(d);
  if (!r) {
    const main = d.split(/[·•|]/)[0];
    r = { value: identParseValue(main), units: identUnitKeys(main) };
    _identDenomCache.set(d, r);
  }
  return r;
}

function identUnitScore(exUnits, coinUnits) {
  if (!exUnits.length || !coinUnits.length) return 0;
  if (exUnits.some(u => coinUnits.includes(u))) return 3;
  const fe = exUnits.map(identFamily), fc = coinUnits.map(identFamily);
  if (fe.some(u => fc.includes(u))) return 2;
  return -3;
}

function identYearScore(year, c) {
  if (!year) return { s: 0, inRange: null };
  const r = parseYearRange(c.range);
  if (!r) return { s: 0, inRange: null };
  return (year >= r.min && year <= r.max) ? { s: 6, inRange: true } : { s: -4, inRange: false };
}

function identHintScore(ex, c) {
  const hint = identNorm([ex.ruler_or_motif, ...(Array.isArray(ex.inscriptions) ? ex.inscriptions : [])].join(' '));
  if (!hint) return 0;
  const text = ' ' + identNorm([c.denom, coinPeriodName(c), c.cecaMaterial].join(' ')) + ' ';
  const words = hint.split(' ').filter(Boolean), seen = new Set();
  let s = 0;
  words.forEach((w, i) => {
    if (/^[ivx]+$/.test(w)) { if (i > 0 && text.includes(' ' + words[i - 1] + ' ' + w + ' ')) s += 3; return; }   // "tupou iv", "george vi"
    if (w.length >= 5 && !IDENT_STOP.has(w) && !seen.has(w) && text.includes(' ' + w + ' ')) { s += 1.5; seen.add(w); }
  });
  return Math.min(s, 4);
}

const identGroupKey = c => (typeof compactGroupKey === 'function' && compactGroupKey(c)) || c.id;   // variantes (KM# 337a/337b…) = un mismo diseño

/* Cruza la lectura con el catálogo.
   Devuelve { state: have|miss|ambiguous|none|unreadable, country, groups (todas, por puntuación), contenders (las que empatan arriba), reason } */
function identMatch(ex, refine) {
  const res = { state: 'unreadable', country: null, groups: [], contenders: [], reason: '' };
  if (!ex) return res;
  if (ex.is_coin === false) { res.reason = 'nocoin'; return res; }
  const value = typeof ex.denomination_value === 'number' ? ex.denomination_value : identParseValue(ex.denomination_value);
  if (!ex.country || !value || !isFinite(value)) { res.reason = !ex.country ? 'nocountry' : 'novalue'; return res; }
  const country = identFindCountry(ex.country);
  if (!country) { res.state = 'none'; res.reason = 'country'; return res; }
  res.country = country;
  const exUnits = identUnitKeys(ex.denomination_unit || '');
  const year = Number(ex.year) || null;
  const cands = coins.filter(c => c.countryId === country.id && Math.abs((identCoinDenom(c).value ?? -1) - value) < 1e-9);
  if (!cands.length) { res.state = 'none'; res.reason = 'denom'; return res; }

  const byKey = new Map();
  cands.forEach(c => {
    const d = identCoinDenom(c), ys = identYearScore(year, c);
    const s = 10 + identUnitScore(exUnits, d.units) + ys.s + identHintScore(ex, c);
    const k = identGroupKey(c);
    if (!byKey.has(k)) byKey.set(k, { key: k, coins: [], score: -99, yearIn: null, owned: false, rep: null, repScore: -99 });
    const g = byKey.get(k);
    g.coins.push(c);
    g.score = Math.max(g.score, s);
    if (ys.inRange === true) g.yearIn = true; else if (ys.inRange === false && g.yearIn === null) g.yearIn = false;
    if (c.acquired) g.owned = true;
    const pick = s + (c.acquired ? 0.01 : 0);   // a igualdad de puntos se enseña la que tengo
    if (pick > g.repScore) { g.repScore = pick; g.rep = c; }
  });
  const groups = [...byKey.values()];
  if (refine) groups.forEach(g => {
    if (refine.same.has(g.key)) g.score += 6;
    else if (refine.sent.has(g.key)) g.score -= 3;
  });
  groups.sort((a, b) => b.score - a.score || (b.owned - a.owned));
  res.groups = groups;
  const top = groups[0].score;
  res.contenders = groups.filter(g => g.score >= top - 2);
  const owned = res.contenders.filter(g => g.owned).length;
  if (res.contenders.length === 1 || owned === 0 || owned === res.contenders.length) res.state = (owned === res.contenders.length) ? 'have' : 'miss';
  else res.state = 'ambiguous';
  return res;
}

/* Búsqueda manual ("fiyi 2 dollars 2014"): misma lógica, sin gastar cuota */
function identParseManual(text) {
  const t = identNorm(text);
  if (!t) return null;
  let country = null, cname = '', len = 0;
  countries.forEach(c => { const n = identNorm(c.name); if (n && (' ' + t + ' ').includes(' ' + n + ' ') && n.length > len) { country = c; cname = n; len = n.length; } });
  Object.keys(IDENT_COUNTRY_ALIASES).forEach(a => {
    if (!(' ' + t + ' ').includes(' ' + a + ' ') || a.length <= len) return;
    const c = identFindCountry(a); if (c) { country = c; cname = a; len = a.length; }
  });
  let rest = country ? (' ' + t + ' ').replace(' ' + cname + ' ', ' ').trim() : t;
  let year = null;
  const ym = rest.match(/\b(1[5-9]\d\d|20\d\d)\b/);
  if (ym) { year = +ym[1]; rest = rest.replace(ym[0], ' ').trim(); }
  return { is_coin: true, country: country ? country.name : null, denomination_value: identParseValue(rest), denomination_unit: rest, year, ruler_or_motif: null, inscriptions: [], denomination_text: rest, source: 'manual' };
}

/* =====================================================================
   2) GEMINI (llamada directa desde el navegador, clave propia, capa gratuita)
   ===================================================================== */
const IDENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_coin: { type: 'BOOLEAN' },
    country: { type: 'STRING', nullable: true },
    denomination_value: { type: 'NUMBER', nullable: true },
    denomination_unit: { type: 'STRING', nullable: true },
    denomination_text: { type: 'STRING', nullable: true },
    year: { type: 'INTEGER', nullable: true },
    ruler_or_motif: { type: 'STRING', nullable: true },
    inscriptions: { type: 'ARRAY', items: { type: 'STRING' } },
    confidence: { type: 'NUMBER' },
    notes: { type: 'STRING', nullable: true }
  },
  required: ['is_coin', 'country', 'denomination_value', 'denomination_unit', 'year', 'confidence']
};

function identPrompt() {
  const known = countries.map(c => c.name).join(', ') || '(none)';
  return `You are an expert numismatist. The attached image(s) show ONE coin (obverse and/or reverse). Identify what can be read on it.
Rules:
- Read the inscriptions literally. Never guess: if something is not legible, use null.
- is_coin: false if the picture does not show a coin.
- country: the issuing country or territory, in Spanish. If it matches one of these catalogue countries use that exact spelling: ${known}.
- denomination_value: the numeric face value as a number (1/2 -> 0.5, "25 CENTS" -> 25).
- denomination_unit: the currency unit as inscribed, singular and lower case (cent, dollar, penny, sene, seniti, boliviano, centavo, florin...).
- denomination_text: the denomination exactly as inscribed (e.g. "25 CENTS").
- year: the minting year as an integer, or null.
- ruler_or_motif: the ruler or monarch portrayed (e.g. "Elizabeth II", "Tupou IV") or the main motif (e.g. "kiwi", "condor").
- inscriptions: the main legible words of the legend.
- confidence: 0 to 1.
- notes: one short sentence only if something matters (worn, partial view, doubt about the year...).`;
}

function identApiError(status, body, raw) {
  const msg = (body && body.error && body.error.message) || raw || ('HTTP ' + status);
  const txt = JSON.stringify(body || {});
  const e = new Error(msg);
  e.status = status;
  if (status === 429) { e.code = /limit:\s*0/.test(msg) ? 'nofree' : (/PerDay|per_day|daily/i.test(txt) ? 'quotaday' : 'quotamin'); e.next = true; }
  else if (status === 404) { e.code = 'nomodel'; e.next = true; }
  else if (status >= 500) { e.code = 'server'; e.next = true; }
  else if (status === 400 && /API key|API_KEY/i.test(msg + txt)) e.code = 'badkey';
  else if (status === 401 || status === 403) e.code = 'forbidden';
  else e.code = 'bad';
  return e;
}

async function identFetch(url, init, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms || 60000);
  try { return await fetch(url, Object.assign({}, init, { signal: ctl.signal })); }
  catch (err) { const e = new Error(String(err && err.message || err)); e.code = (err && err.name === 'AbortError') ? 'timeout' : 'net'; throw e; }
  finally { clearTimeout(timer); }
}

// Prueba los modelos por orden: si uno no existe, no tiene cuota o está saturado, pasa al siguiente
async function identGenerate(parts, schema) {
  const key = identKey();
  if (!key) { const e = new Error('nokey'); e.code = 'nokey'; throw e; }
  const body = { contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } };
  let last = null;
  for (const model of identModels()) {
    try {
      const r = await identFetch(IDENT_API + 'models/' + encodeURIComponent(model) + ':generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body)
      }, 60000);
      const raw = await r.text();
      let j = null; try { j = JSON.parse(raw); } catch (e) {}
      if (!r.ok) throw identApiError(r.status, j, raw.slice(0, 200));
      const cand = j && j.candidates && j.candidates[0];
      if (!cand) { const e = new Error('blocked'); e.code = 'blocked'; e.detail = j && j.promptFeedback && j.promptFeedback.blockReason; throw e; }
      const txt = ((cand.content && cand.content.parts) || []).filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('').replace(/^\s*```(?:json)?|```\s*$/g, '').trim();
      if (!txt) { const e = new Error('empty'); e.code = 'empty'; throw e; }
      identBumpUsage();
      return { data: JSON.parse(txt), model };
    } catch (e) {
      last = e;
      if (e.next) continue;
      throw e;
    }
  }
  throw last || new Error('Sin modelos');
}

function identErrorText(e) {
  const c = e && e.code;
  if (c === 'nokey') return 'Falta la clave de Gemini. Pulsa la llave de arriba para añadirla.';
  if (c === 'badkey') return 'Google no acepta esa clave. Revísala en aistudio.google.com/apikey.';
  if (c === 'forbidden') return 'Google ha rechazado la petición (clave sin permiso o servicio no disponible en tu región).';
  if (c === 'quotaday') return 'Has agotado la cuota gratuita de hoy. Se renueva a medianoche (hora del Pacífico, hacia las 9:00 en España). Mientras tanto puedes usar la búsqueda manual.';
  if (c === 'quotamin') return 'Demasiadas consultas seguidas para la capa gratuita. Espera un minuto y vuelve a intentarlo.';
  if (c === 'nofree') return 'Google indica que tu proyecto no tiene cuota gratuita para ese modelo. Pulsa la llave y «Detectar modelos» para buscar otro.';
  if (c === 'nomodel') return 'Ninguno de los modelos configurados existe ya. Pulsa la llave y «Detectar modelos».';
  if (c === 'server') return 'Los servidores de Google están saturados. Inténtalo de nuevo en un momento.';
  if (c === 'net') return 'No hay conexión con Google. Comprueba tu conexión a internet.';
  if (c === 'timeout') return 'Google tarda demasiado en responder. Inténtalo de nuevo.';
  if (c === 'blocked') return 'Google no ha querido analizar esa imagen' + (e.detail ? ' (' + e.detail + ')' : '') + '. Prueba con otra foto.';
  if (c === 'empty') return 'La respuesta de Gemini ha llegado vacía. Inténtalo de nuevo.';
  return 'No se ha podido identificar: ' + ((e && e.message) || 'error desconocido').slice(0, 160);
}

function identSanitize(d) {
  const str = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = v => { const n = typeof v === 'number' ? v : identParseValue(v); return (n && isFinite(n)) ? n : null; };
  let year = parseInt(d && d.year, 10);
  if (!(year >= 1400 && year <= new Date().getFullYear() + 1)) year = null;
  return {
    is_coin: d && d.is_coin !== false,
    country: str(d && d.country), denomination_value: num(d && d.denomination_value), denomination_unit: str(d && d.denomination_unit),
    denomination_text: str(d && d.denomination_text), year, ruler_or_motif: str(d && d.ruler_or_motif),
    inscriptions: Array.isArray(d && d.inscriptions) ? d.inscriptions.filter(x => typeof x === 'string').slice(0, 12) : [],
    confidence: Number(d && d.confidence) || 0, notes: str(d && d.notes), source: 'gemini'
  };
}

/* ----- Fotos: se reducen y se pasan a JPEG antes de enviarlas ----- */
async function identPrepareFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se puede leer esa imagen (¿formato HEIC?). Prueba con JPG o PNG.')); i.src = url; });
    const k = Math.min(1, IDENT_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const src = cv.toDataURL('image/jpeg', 0.85);
    return { src, b64: src.slice(src.indexOf(',') + 1), mime: 'image/jpeg' };
  } finally { URL.revokeObjectURL(url); }
}

async function identAddFiles(files) {
  const list = Array.from(files || []).filter(f => f && /^image\//.test(f.type || 'image/'));
  if (!list.length) return;
  identError = '';
  for (const f of list.slice(0, 2)) {
    try {
      const p = await identPrepareFile(f);
      if (identPhotos.length >= 2) identPhotos[1] = p; else identPhotos.push(p);
    } catch (e) { identError = e.message || 'No se puede leer esa imagen.'; }
  }
  identExtract = null; identRefine = null;
  renderIdentificar();
}
function identPick(id) { const el = document.getElementById(id); if (el) { el.value = ''; el.click(); } }
function identOnFiles(input) { const f = input.files; identAddFiles(f); }
function identRemovePhoto(i) { identPhotos.splice(i, 1); identExtract = null; identRefine = null; identError = ''; renderIdentificar(); }
function identClear() { identPhotos = []; identExtract = null; identRefine = null; identError = ''; renderIdentificar(); }

/* ----- Acciones ----- */
async function identRun() {
  if (identBusy || !identPhotos.length) return;
  if (!identKey()) { identToggleSettings(true); identError = identErrorText({ code: 'nokey' }); renderIdentificar(); return; }
  identBusy = true; identBusyMsg = 'Analizando la moneda…'; identError = ''; identExtract = null; identRefine = null;
  renderIdentificar();
  try {
    const parts = [{ text: identPrompt() }].concat(identPhotos.map(p => ({ inline_data: { mime_type: p.mime, data: p.b64 } })));
    const { data, model } = await identGenerate(parts, IDENT_SCHEMA);
    identExtract = identSanitize(data); identExtract.model = model;
  } catch (e) { identError = identErrorText(e); }
  identBusy = false;
  renderIdentificar(true);
}

function identRunManual() {
  const el = document.getElementById('xid-manual');
  identManualText = el ? el.value : identManualText;
  const ex = identParseManual(identManualText);
  identError = ''; identRefine = null; identExtract = ex;
  if (!ex) identError = 'Escribe el país y el valor, p. ej. «fiyi 2 dollars».';
  renderIdentificar(true);
}

// Segunda consulta (opcional): se envían la foto y las imágenes del catálogo de las candidatas empatadas para que Gemini diga cuáles se parecen
async function identRefineRun() {
  const m = identLastMatch;
  if (identBusy || !m || m.contenders.length < 2 || !identPhotos.length) return;
  identBusy = true; identBusyMsg = 'Comparando con las imágenes del catálogo…'; identError = '';
  renderIdentificar();
  try {
    const sent = m.contenders.slice(0, 6);
    const parts = [{ text: 'The first image(s) are a photo of a coin taken by the user. Then come numbered catalogue candidates, each with its obverse/reverse reference picture. Decide which candidates show the SAME coin type/design as the photo (same portrait, motifs and layout; ignore the minting year, photo quality and lighting). Return the indices of every candidate that matches (empty if none) and the single best one.' }]
      .concat(identPhotos.map(p => ({ inline_data: { mime_type: p.mime, data: p.b64 } })));
    for (let i = 0; i < sent.length; i++) {
      const c = sent[i].rep;
      parts.push({ text: `Candidate ${i}: ${c.denom} · ${coinPeriodName(c)} · ${c.range || ''}` });
      for (const side of ['front', 'back']) {
        if (!c[side === 'front' ? 'hasFront' : 'hasBack']) continue;
        const blob = await dbGetImage(imgKey(c.id, side));
        if (blob) { const u = await blobToDataURL(blob); parts.push({ inline_data: { mime_type: blob.type || 'image/webp', data: u.slice(u.indexOf(',') + 1) } }); }
      }
    }
    const schema = { type: 'OBJECT', properties: { same_design_indices: { type: 'ARRAY', items: { type: 'INTEGER' } }, best_index: { type: 'INTEGER', nullable: true }, reason: { type: 'STRING', nullable: true } }, required: ['same_design_indices'] };
    const { data } = await identGenerate(parts, schema);
    const idx = new Set((data.same_design_indices || []).filter(i => Number.isInteger(i) && i >= 0 && i < sent.length));
    if (Number.isInteger(data.best_index) && data.best_index >= 0 && data.best_index < sent.length) idx.add(data.best_index);
    identRefine = { sent: new Set(sent.map(g => g.key)), same: new Set([...idx].map(i => sent[i].key)), reason: data.reason || '' };
  } catch (e) { identError = identErrorText(e); }
  identBusy = false;
  renderIdentificar(true);
}

function identAddToCatalog() {
  const ex = identExtract; if (!ex) return;
  const co = identFindCountry(ex.country);
  openCreateModal();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const title = s => String(s || '').toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
  set('new-country', co ? co.name : title(ex.country));
  const v = ex.denomination_value;
  const vt = v == null ? '' : (v === 0.5 ? '1/2' : v === 0.25 ? '1/4' : String(Math.round(v * 100) / 100));
  set('new-denom', ex.source === 'manual' ? title(ex.denomination_text) : (title(ex.denomination_text) || (vt + ' ' + title(ex.denomination_unit)).trim()));
  set('new-range', ex.year ? String(ex.year) : '');
}

/* ----- Ajustes (clave y modelos) ----- */
function identToggleSettings(open) {
  const box = document.getElementById('xid-settings'); if (!box) return;
  const show = typeof open === 'boolean' ? open : box.classList.contains('hidden');
  box.classList.toggle('hidden', !show);
  if (show) { document.getElementById('xid-key').value = identKey(); document.getElementById('xid-models').value = identLsGet(IDENT_MODELS_LS) || IDENT_DEFAULT_MODELS.join(', '); identSetMsg(''); }
}
function identSetMsg(t, bad) { const el = document.getElementById('xid-setmsg'); if (el) { el.textContent = t; el.className = 'xid-setmsg' + (bad ? ' xid-bad' : ''); } }
function identToggleKeyVisible() { const el = document.getElementById('xid-key'); el.type = el.type === 'password' ? 'text' : 'password'; }
function identSaveSettings() {
  const k = document.getElementById('xid-key').value.trim(), m = document.getElementById('xid-models').value.trim();
  identLsSet(IDENT_KEY_LS, k);
  identLsSet(IDENT_MODELS_LS, (m && m.replace(/\s+/g, '') !== IDENT_DEFAULT_MODELS.join(',')) ? m : '');
  identSetMsg(k ? 'Guardado en este dispositivo.' : 'Clave borrada.');
  identError = ''; renderIdentificar();
}
function identDeleteKey() { document.getElementById('xid-key').value = ''; identSaveSettings(); }
async function identDetectModels() {
  const k = document.getElementById('xid-key').value.trim();
  if (!k) { identSetMsg('Primero pega tu clave.', true); return; }
  identSetMsg('Consultando a Google…');
  try {
    const r = await identFetch(IDENT_API + 'models?pageSize=200', { headers: { 'x-goog-api-key': k } }, 20000);
    const j = await r.json().catch(() => null);
    if (!r.ok) throw identApiError(r.status, j, '');
    const ver = id => { const m = id.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const list = (j.models || []).filter(m => /flash/.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent') && !/tts|image|live|audio|embed|thinking|preview|exp|robot|computer|native|learn/.test(m.name))
      .map(m => m.name.replace(/^models\//, ''))
      .sort((a, b) => (/lite/.test(b) - /lite/.test(a)) || (ver(b) - ver(a)) || a.localeCompare(b));
    if (!list.length) { identSetMsg('No he encontrado modelos Flash disponibles con esa clave.', true); return; }
    document.getElementById('xid-models').value = list.slice(0, 4).join(', ');
    identSetMsg('Encontrados: ' + list.slice(0, 8).join(', ') + '. Pulsa Guardar para usarlos.');
  } catch (e) { identSetMsg(identErrorText(e), true); }
}

/* =====================================================================
   3) PANTALLA
   ===================================================================== */
const identIsTouch = () => (window.matchMedia && matchMedia('(pointer:coarse)').matches) || (navigator.maxTouchPoints > 0 && window.innerWidth < 900);
let identLastMatch = null;

function identBuild() {
  if (identBuilt) return;
  const root = document.getElementById('view-identificar');
  if (!root) return;
  root.innerHTML = `
    <input type="file" id="xid-file-cam" accept="image/*" capture="environment" class="hidden" onchange="identOnFiles(this)">
    <input type="file" id="xid-file-gal" accept="image/*" class="hidden" onchange="identOnFiles(this)">
    <section class="xid-head">
      <span class="xid-logo"><i class="fa-solid fa-camera"></i></span>
      <div class="xid-htxt"><h2>Identificación</h2><p>Foto de una moneda y te digo si ya la tienes</p></div>
      <span class="xid-count" id="xid-count" title="Consultas a Gemini hoy (contador de este dispositivo)"></span>
      <button type="button" class="xi-btn xid-key-btn" onclick="identToggleSettings()" title="Clave de Gemini y modelos" aria-label="Clave de Gemini y modelos"><i class="fa-solid fa-key"></i></button>
    </section>
    <section id="xid-settings" class="xid-set hidden">
      <label class="xid-lab">Clave de Gemini (gratuita)</label>
      <div class="xid-row">
        <input type="password" id="xid-key" class="xid-in" autocomplete="off" spellcheck="false" placeholder="AIza…">
        <button type="button" class="xid-sq" onclick="identToggleKeyVisible()" aria-label="Mostrar u ocultar la clave"><i class="fa-solid fa-eye"></i></button>
      </div>
      <p class="xid-note">Créala gratis en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (sin tarjeta). Se guarda solo en este dispositivo y no entra en las copias de seguridad.</p>
      <label class="xid-lab">Modelos (se prueban por orden)</label>
      <input type="text" id="xid-models" class="xid-in" autocomplete="off" spellcheck="false">
      <div class="xid-row xid-wrap">
        <button type="button" class="xid-btn" onclick="identSaveSettings()">Guardar</button>
        <button type="button" class="xid-btn xid-soft" onclick="identDetectModels()"><i class="fa-solid fa-wand-magic-sparkles"></i> Detectar modelos</button>
        <button type="button" class="xid-btn xid-soft" onclick="identDeleteKey()"><i class="fa-solid fa-trash-can"></i> Borrar clave</button>
      </div>
      <p id="xid-setmsg" class="xid-setmsg"></p>
      <p class="xid-note">Las fotos se envían a Google para analizarlas; en la capa gratuita Google puede usarlas para mejorar sus productos. No subas nada que no quieras compartir.</p>
    </section>
    <section id="xid-capture"></section>
    <section id="xid-manualbox" class="xid-manual">
      <label class="xid-lab" for="xid-manual">Sin foto o sin cuota: búsqueda manual</label>
      <div class="xid-row">
        <input type="search" id="xid-manual" class="xid-in" autocomplete="off" placeholder="Ej.: fiyi 2 dollars 2014" onkeydown="if(event.key==='Enter')identRunManual()">
        <button type="button" class="xid-btn" onclick="identRunManual()"><i class="fa-solid fa-magnifying-glass"></i></button>
      </div>
    </section>
    <section id="xid-result" class="xid-result"></section>`;
  // Ordenador: arrastrar y soltar, y pegar con Ctrl+V
  root.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); root.classList.add('xid-over'); } });
  root.addEventListener('dragleave', e => { if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove('xid-over'); });
  root.addEventListener('drop', e => { root.classList.remove('xid-over'); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); identAddFiles(e.dataTransfer.files); } });
  window.addEventListener('paste', e => {
    if (currentTab !== 'identificar' || !e.clipboardData) return;
    const files = Array.from(e.clipboardData.files || []).filter(f => /^image\//.test(f.type));
    if (files.length) { e.preventDefault(); identAddFiles(files); }
  });
  identBuilt = true;
}

function identFichaImg(c, side) {
  const has = side === 'front' ? c.hasFront : c.hasBack;
  return has ? imgTag(c.id, side) : `<span class="xid-fb">${esc(c.denom)}</span>`;
}

function identRarityChip(c) {
  if (!c.rarity) return '';
  const r = String(c.rarity).toUpperCase();
  return `<span class="xf-chip" style="${getRarityStyle(c.rarity)}">${r === 'PLATA' ? 'AG' : esc(r)}</span>`;
}

// Ejemplares que tengo de un grupo (solo los que tienen conservación)
function identMineHtml(g) {
  const rows = [];
  g.coins.forEach(c => (Array.isArray(c.items) ? c.items : []).forEach(it => {
    if (it && String(it.grade || '').trim()) rows.push({ c, it });
  }));
  if (!rows.length) return '';
  const multi = g.coins.length > 1;
  return `<div class="xf-card xf-mine xid-mine">
    <div class="xid-minetitle"><i class="fa-solid fa-circle-check"></i> Tengo en mi colección</div>
    ${rows.map(({ c, it }) => `<div class="xid-it">
      <span class="xid-ity">${esc(it.year || 's/f')}</span><span class="xid-ig">${esc(it.grade)}</span>
      <span class="xid-ifm">${itemFormatIcon(it.format, 16)}</span>
      <span class="xid-in2">${esc(it.notes || (multi ? c.km : '') || '')}</span></div>`).join('')}
  </div>`;
}

function identFichaHtml(g, opts) {
  const c = g.rep, co = countryById(c.countryId), photo = identPhotos[0];
  const flag = co ? `<span class="xf-flag" style="background:${flagLayers(co).replace(/"/g, '&quot;')}"></span>` : '';
  const type = coinType(c);
  const yearNote = (identExtract && identExtract.year && g.yearIn === false)
    ? `<p class="xid-warn"><i class="fa-solid fa-triangle-exclamation"></i> El año ${identExtract.year} queda fuera del rango de esta ficha (${esc(formatYearRange(c.range))}). Compara las imágenes.</p>` : '';
  return `<article class="xid-ficha">
    <div class="xf-hero xid-hero">
      <div class="xid-circles">
        ${photo ? `<figure class="xid-circ xid-mine-ph"><img src="${photo.src}" alt="Tu foto"><figcaption>Tu foto</figcaption></figure>` : ''}
        <figure class="xid-circ xid-cat"><div class="xid-cimg">${identFichaImg(c, 'front')}</div><figcaption>Anverso</figcaption></figure>
        <figure class="xid-circ xid-cat"><div class="xid-cimg">${identFichaImg(c, 'back')}</div><figcaption>Reverso</figcaption></figure>
      </div>
    </div>
    <div class="xf-titlebox"><h3 class="xf-title">${esc(c.denom)}</h3></div>
    <div class="xf-info">
      <div class="xf-r"><span class="xf-pill xf-dark xf-grow">${esc(coinCountryName(c))}</span><span class="xf-pill xf-km">${esc(c.km || 'KM# -')}</span>${identRarityChip(c)}</div>
      <div class="xf-r"><span class="xf-pill xf-line xf-yr">${esc(formatYearRange(c.range))}</span><span class="xf-pill xf-dark xf-grow">${esc(coinPeriodName(c))}</span></div>
      <div class="xf-r">${flag}<span class="xf-pill xf-line xf-grow">${esc((c.cecaMaterial || '').trim() || '—')}</span><span class="xf-chip xf-type" style="background:${COIN_TYPE_COLORS[type] || COIN_TYPE_COLORS[DEFAULT_COIN_TYPE]}">${esc(type.toUpperCase())}</span></div>
    </div>
    ${g.coins.length > 1 ? `<p class="xid-note xid-light">Hay ${g.coins.length} variantes de esta ficha (${g.coins.map(x => esc(x.km || '')).filter(Boolean).join(' · ')}).</p>` : ''}
    ${yearNote}
    ${g.owned ? identMineHtml(g) : ''}
    <div class="xid-foot"><button type="button" class="xid-btn xid-big" onclick="openCoinModal('${jsArg(c.id)}')"><i class="fa-solid fa-id-card"></i> ABRIR FICHA${g.owned ? '' : ' Y AÑADIRLA'}</button></div>
  </article>`;
}

function identCandHtml(g) {
  const c = g.rep;
  return `<button type="button" class="xid-cand" onclick="openCoinModal('${jsArg(c.id)}')">
    <span class="xid-cimg xid-cmini">${identFichaImg(c, 'front')}</span>
    <span class="xid-ctxt"><b>${esc(c.denom)}</b><small>${esc(coinPeriodName(c))} · ${esc(formatYearRange(c.range))}${c.km ? ' · ' + esc(c.km) : ''}</small></span>
    <span class="xid-badge ${g.owned ? 'xid-b-have' : 'xid-b-miss'}">${g.owned ? 'LA TENGO' : 'NO LA TENGO'}</span>
  </button>`;
}

function identSeenHtml(ex) {
  const chips = [];
  if (ex.country) chips.push(`<i class="fa-solid fa-earth-europe"></i> ${esc(ex.country)}`);
  const den = ex.denomination_text || [ex.denomination_value, ex.denomination_unit].filter(x => x != null && x !== '').join(' ');
  if (den) chips.push(`<i class="fa-solid fa-coins"></i> ${esc(den)}`);
  if (ex.year) chips.push(`<i class="fa-regular fa-calendar"></i> ${ex.year}`);
  if (ex.ruler_or_motif) chips.push(`<i class="fa-solid fa-crown"></i> ${esc(ex.ruler_or_motif)}`);
  if (!chips.length) return '';
  return `<div class="xid-seen"><span class="xid-seenlab">${ex.source === 'manual' ? 'Has escrito' : 'He leído'}</span>${chips.map(c => `<span class="xid-chip">${c}</span>`).join('')}</div>`;
}

function identBanner(kind, title, sub) {
  const ico = { have: 'fa-circle-check', miss: 'fa-circle-exclamation', none: 'fa-circle-question', ambiguous: 'fa-clone', unreadable: 'fa-eye-slash' }[kind];
  return `<div class="xid-banner xid-k-${kind}"><span class="xid-bico"><i class="fa-solid ${ico}"></i></span><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div></div>`;
}

function identResultHtml() {
  if (identBusy) return `<div class="xid-busy"><i class="fa-solid fa-circle-notch fa-spin"></i><span>${esc(identBusyMsg)}</span></div>`;
  let html = '';
  if (identError) html += `<div class="xid-err"><i class="fa-solid fa-triangle-exclamation"></i><span>${esc(identError)}</span></div>`;
  identLastMatch = null;
  const ex = identExtract;
  if (!ex) return html;
  const m = identMatch(ex, identRefine);
  identLastMatch = m;
  const seen = identSeenHtml(ex);
  const lowConf = ex.source === 'gemini' && ex.confidence && ex.confidence < 0.5;
  const note = ex.notes ? `<p class="xid-note xid-pad">${esc(ex.notes)}</p>` : '';
  const refineBtn = (m.contenders.length > 1 && identPhotos.length && identKey() && !identRefine)
    ? `<button type="button" class="xid-btn xid-soft xid-full" onclick="identRefineRun()"><i class="fa-solid fa-code-compare"></i> Afinar comparando con las imágenes del catálogo</button>` : '';
  const refineMsg = identRefine ? `<p class="xid-note xid-pad">${identRefine.same.size ? 'Gemini ha comparado tu foto con las imágenes del catálogo.' : 'Ninguna imagen del catálogo se parece claramente a tu foto.'}${identRefine.reason ? ' ' + esc(identRefine.reason) : ''}</p>` : '';

  if (m.state === 'unreadable') {
    const why = { nocoin: 'La imagen no parece una moneda.', nocountry: 'No he podido leer el país.', novalue: 'No he podido leer el valor.' }[m.reason] || 'No he podido leerla.';
    return html + identBanner('unreadable', 'No he podido leerla', why + ' Prueba con más luz, una foto más cercana o añade la otra cara.') + seen + note;
  }
  if (m.state === 'none') {
    const why = m.reason === 'country'
      ? `No tienes ninguna moneda de <b>${esc(ex.country)}</b> en el catálogo.`
      : `Hay fichas de <b>${esc(m.country.name)}</b>, pero ninguna de <b>${esc(ex.denomination_text || ex.denomination_value)}</b>.`;
    return html + identBanner('none', 'No está en el catálogo', why) + seen + note
      + `<div class="xid-foot"><button type="button" class="xid-btn xid-big" onclick="identAddToCatalog()"><i class="fa-solid fa-plus"></i> AÑADIRLA AL CATÁLOGO</button></div>`
      + (lowConf ? '<p class="xid-note xid-pad">Lectura poco segura: comprueba que el país y el valor son correctos.</p>' : '');
  }
  const top = m.contenders[0];
  if (m.state === 'ambiguous') {
    return html + identBanner('ambiguous', 'Varias fichas posibles', 'Tu foto encaja con fichas que tienes y otras que no. Compáralas.') + seen + note + refineMsg
      + `<div class="xid-cands">${m.contenders.map(identCandHtml).join('')}</div>` + refineBtn;
  }
  const have = m.state === 'have';
  const owned = have ? top.coins.flatMap(c => (Array.isArray(c.items) ? c.items : []).filter(i => i && String(i.grade || '').trim()).map(i => i.year || 's/f')) : [];
  const sub = have
    ? (owned.length ? 'Ya está en tu colección · ejemplares: ' + [...new Set(owned)].map(esc).join(', ') : 'Ya está en tu colección.')
    : 'Está en el catálogo, pero todavía no la has conseguido.';
  const others = m.contenders.slice(1);
  return html + identBanner(have ? 'have' : 'miss', have ? 'La tengo' : 'No la tengo', sub) + seen + note
    + identFichaHtml(top) + refineMsg
    + (others.length ? `<h4 class="xid-sub">También podría ser</h4><div class="xid-cands">${others.map(identCandHtml).join('')}</div>` + refineBtn : '')
    + (lowConf ? '<p class="xid-note xid-pad">Lectura poco segura: comprueba que es la misma moneda.</p>' : '');
}

function identCaptureHtml() {
  const touch = identIsTouch();
  let h = '';
  if (!identKey()) {
    h += `<div class="xid-setup"><i class="fa-solid fa-key"></i><div><b>Falta tu clave gratuita de Gemini</b><span>Se consigue en un minuto, sin tarjeta, y no hay que pagar nada con ~50 consultas al día.</span></div><button type="button" class="xid-btn" onclick="identToggleSettings(true)">Configurar</button></div>`;
  }
  if (!identPhotos.length) {
    h += touch
      ? `<div class="xid-take">
          <button type="button" class="xid-cam" onclick="identPick('xid-file-cam')"><i class="fa-solid fa-camera"></i><span>HACER FOTO</span></button>
          <button type="button" class="xid-btn xid-soft xid-full" onclick="identPick('xid-file-gal')"><i class="fa-solid fa-image"></i> Elegir de la galería</button>
        </div>`
      : `<button type="button" class="xid-drop" onclick="identPick('xid-file-gal')">
          <i class="fa-solid fa-cloud-arrow-up"></i><b>Sube una foto de la moneda</b>
          <span>Pulsa aquí, arrastra la imagen o pégala con Ctrl+V</span>
        </button>`;
  } else {
    h += `<div class="xid-photos xid-p${identPhotos.length}">${identPhotos.map((p, i) => `<figure class="xid-ph"><img src="${p.src}" alt="Foto ${i + 1}"><button type="button" class="xid-x" onclick="identRemovePhoto(${i})" aria-label="Quitar esta foto"><i class="fa-solid fa-xmark"></i></button><figcaption>${identPhotos.length > 1 ? (i === 0 ? 'Cara 1' : 'Cara 2') : 'Tu foto'}</figcaption></figure>`).join('')}</div>
      <div class="xid-row xid-wrap">
        ${identPhotos.length < 2 ? `<button type="button" class="xid-btn xid-soft" onclick="identPick('${touch ? 'xid-file-cam' : 'xid-file-gal'}')"><i class="fa-solid fa-plus"></i> Otra cara</button>` : ''}
        <button type="button" class="xid-btn xid-soft" onclick="identClear()"><i class="fa-solid fa-trash-can"></i> Quitar</button>
        <button type="button" class="xid-btn xid-big xid-grow" onclick="identRun()" ${identBusy ? 'disabled' : ''}><i class="fa-solid fa-magnifying-glass"></i> IDENTIFICAR</button>
      </div>`;
  }
  return h;
}

function renderIdentificar(scroll) {
  identBuild();
  const cap = document.getElementById('xid-capture'), res = document.getElementById('xid-result'), cnt = document.getElementById('xid-count');
  if (!cap || !res) return;
  const n = identUsageToday();
  if (cnt) cnt.innerHTML = `<b>${n}</b> hoy`;
  cap.innerHTML = identCaptureHtml();
  res.innerHTML = identResultHtml();
  hydrateImages(res);
  if (scroll) { const t = res.firstElementChild; if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
