/* ===== IDENTIFICACIÓN POR FOTO · núcleo (sin interfaz) =====
   1) identPrepareImage: reduce la foto del móvil (orientación EXIF corregida, JPEG de ≤1024 px).
   2) identReadCoin:     envía la/s foto/s a Gemini (Google) en UNA sola petición y recibe la lectura de la moneda como JSON
                         (país, denominación, año, ceca, soberano, KM# solo si está escrito en la foto…).
   3) identMatchReading: compara esa lectura con TU colección (país → valor facial → unidad → año dentro del rango → KM# → soberano).
   4) identOwnership:    ¿tengo ese ejemplar? (mismo tipo y mismo año).
   Es GRATIS: usa una clave del plan gratuito de Google AI Studio (sin tarjeta). Ese plan limita las peticiones por día y por minuto;
   la app lleva la cuenta del día en este dispositivo (límite editable) y guarda las lecturas ya hechas, así que repetir la misma foto no gasta cupo.
   La clave se guarda solo en este dispositivo y nunca va en las copias de seguridad. */

const IDENT_KEY_STORAGE = 'plaza-ident-gkey';
const IDENT_MODEL_STORAGE = 'plaza-ident-gmodel';
const IDENT_CUSTOM_STORAGE = 'plaza-ident-gcustom';
const IDENT_LIMIT_STORAGE = 'plaza-ident-limit';
const IDENT_USAGE_STORAGE = 'plaza-ident-usage';
const IDENT_CACHE_STORAGE = 'plaza-ident-cache';
const IDENT_DEFAULT_LIMIT = 20;      // prudente: Google cambia estos cupos con frecuencia (se puede editar)
const IDENT_CACHE_MAX = 40;
const IDENT_IMG_MAX = 1024;
const IDENT_BASE = 'https://generativelanguage.googleapis.com/v1beta/';
// "-latest" son alias que Google mueve al modelo Flash vigente, así la app no se rompe cuando retiran uno concreto
const IDENT_MODELS = [
  { id: 'gemini-flash-latest',      label: 'Flash · equilibrado (recomendado)' },
  { id: 'gemini-flash-lite-latest', label: 'Flash-Lite · más rápido y con más cupo' }
];

// La clave de Anthropic de la versión anterior ya no se usa: se borra del dispositivo
try { localStorage.removeItem('plaza-ident-key'); localStorage.removeItem('plaza-ident-model'); } catch (e) {}

function identLsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function identLsSet(k, v) { try { if (v === null || v === '' || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

function identGetKey() { return identLsGet(IDENT_KEY_STORAGE) || ''; }
function identSetKey(k) { identLsSet(IDENT_KEY_STORAGE, k); }
function identGetPreset() { const m = identLsGet(IDENT_MODEL_STORAGE); return IDENT_MODELS.some(x => x.id === m) ? m : IDENT_MODELS[0].id; }
function identGetCustomModel() { return (identLsGet(IDENT_CUSTOM_STORAGE) || '').trim(); }
function identGetModel() { return identGetCustomModel() || identGetPreset(); }
function identSetModel(preset, custom) { identLsSet(IDENT_MODEL_STORAGE, preset); identLsSet(IDENT_CUSTOM_STORAGE, (custom || '').trim().replace(/^models\//, '')); }
function identModelLabel() {
  const c = identGetCustomModel();
  return c ? c : (IDENT_MODELS.find(x => x.id === identGetPreset()) || IDENT_MODELS[0]).label.split(' ·')[0];
}

/* ---------- Cupo diario (el de Google se reinicia a medianoche, hora del Pacífico) ---------- */
function identDayPT(d) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date()); }
  catch (e) { return (d || new Date()).toISOString().slice(0, 10); }
}
function identResetLabel() {   // hora local a la que empieza el siguiente día del Pacífico, redondeada a la hora
  const d0 = identDayPT(), base = Date.now();
  for (let m = 1; m <= 26 * 60; m += 5) {
    const t = new Date(base + m * 60000);
    if (identDayPT(t) !== d0) {
      const r = new Date(Math.round(t.getTime() / 3600000) * 3600000);
      return r.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }
  }
  return '';
}
function identGetLimit() { const n = parseInt(identLsGet(IDENT_LIMIT_STORAGE), 10); return (n >= 1 && n <= 1000) ? n : IDENT_DEFAULT_LIMIT; }
function identSetLimit(n) { n = parseInt(n, 10); identLsSet(IDENT_LIMIT_STORAGE, (n >= 1 && n <= 1000) ? String(n) : ''); }
function identUsage() {
  const today = identDayPT();
  try { const u = JSON.parse(identLsGet(IDENT_USAGE_STORAGE) || 'null'); if (u && u.day === today && u.n >= 0) return u; } catch (e) {}
  return { day: today, n: 0 };
}
function identRemaining() { return Math.max(0, identGetLimit() - identUsage().n); }
function identSaveUsage(n) { identLsSet(IDENT_USAGE_STORAGE, JSON.stringify({ day: identDayPT(), n: Math.max(0, n) })); }
function identCountUse() { identSaveUsage(identUsage().n + 1); }
function identMarkExhausted() { identSaveUsage(Math.max(identUsage().n, identGetLimit())); }
function identResetUsage() { identSaveUsage(0); }

/* ---------- Lecturas guardadas: la misma foto no vuelve a gastar cupo ---------- */
function identHash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + s.length.toString(36); }
function identCacheKey(photos) { return photos.map(p => identHash(p.b64)).join('-'); }
function identCacheLoad() { try { const a = JSON.parse(identLsGet(IDENT_CACHE_STORAGE) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function identCacheGet(photos) { const k = identCacheKey(photos), hit = identCacheLoad().find(x => x.k === k); return hit ? hit.r : null; }
function identCachePut(photos, r) {
  const k = identCacheKey(photos), a = identCacheLoad().filter(x => x.k !== k);
  a.push({ k, t: Date.now(), r });
  identLsSet(IDENT_CACHE_STORAGE, JSON.stringify(a.slice(-IDENT_CACHE_MAX)));
}
function identCacheClear() { identLsSet(IDENT_CACHE_STORAGE, ''); }

/* ---------- 1) Foto → JPEG reducido + miniatura ---------- */
function identLoadImg(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), i = new Image();
    i.onload = () => { res({ img: i, url }); };
    i.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen')); };
    i.src = url;
  });
}
async function identPrepareImage(file) {
  let src = null, w = 0, h = 0, revoke = null;
  try { const b = await createImageBitmap(file, { imageOrientation: 'from-image' }); src = b; w = b.width; h = b.height; } catch (e) { src = null; }
  if (!src) { const l = await identLoadImg(file); src = l.img; w = src.naturalWidth; h = src.naturalHeight; revoke = l.url; }
  if (!w || !h) throw new Error('La imagen está vacía');
  const draw = max => {
    const k = Math.min(1, max / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch); cx.drawImage(src, 0, 0, cw, ch);
    return cv;
  };
  const big = draw(IDENT_IMG_MAX).toDataURL('image/jpeg', 0.82);
  const preview = draw(520).toDataURL('image/jpeg', 0.8);
  if (revoke) URL.revokeObjectURL(revoke);
  if (src.close) try { src.close(); } catch (e) {}
  return { b64: big.split(',')[1], mime: 'image/jpeg', preview };
}

/* ---------- 2) Lectura con visión (Gemini, directo desde el navegador) ---------- */
const IDENT_SYSTEM =
  'Eres un numismático experto. Recibes 1 o 2 fotos de UNA moneda física (anverso y/o reverso). ' +
  'Lee con precisión lo que se ve: leyendas, denominación, año, marca de ceca, nombre del soberano o emisor, escudos y retratos. ' +
  'Identifica el país emisor (el estado que la emitió en esa época). ' +
  'No inventes nada: si un dato no se lee o no estás seguro, devuélvelo como null y explica la duda en "notes". ' +
  'NUNCA des un número de catálogo KM# salvo que esté escrito en la propia foto (cartulina, etiqueta, cápsula). ' +
  'Si el año está en otro calendario (hégira, era budista, etc.) conviértelo al gregoriano en "year" y deja el original en "year_printed". ' +
  'El valor facial va como número ("value"; ½ = 0.5) y "unit" es la unidad monetaria en inglés, en minúscula y singular (peseta, cent, dollar, penny, shilling, franc, mark, pfennig, pound, lira, peso, centavo, bani, sene, seniti…). ' +
  '"country" es el nombre del país en español. Si el país corresponde a uno del catálogo del usuario (aunque lo conozcas con otro nombre o sea un estado histórico del mismo territorio), pon en "catalog_country" ese nombre EXACTO de la lista; si no, null. ' +
  'Si lo que ves no es una moneda (billete, medalla, ficha, objeto o foto ilegible), indícalo en "kind". Responde únicamente con el JSON del esquema.';

const IDENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['coin', 'token_or_medal', 'banknote', 'not_a_coin', 'unreadable'] },
    country: { type: 'STRING', nullable: true, description: 'País emisor en español' },
    country_en: { type: 'STRING', nullable: true, description: 'País emisor en inglés' },
    catalog_country: { type: 'STRING', nullable: true, description: 'Nombre EXACTO del país del catálogo del usuario, o null' },
    denomination_text: { type: 'STRING', nullable: true, description: 'Denominación tal como se lee, p. ej. "25 PESETAS"' },
    value: { type: 'NUMBER', nullable: true, description: 'Valor facial numérico' },
    unit: { type: 'STRING', nullable: true, description: 'Unidad monetaria en inglés, minúscula y singular' },
    year: { type: 'INTEGER', nullable: true, description: 'Año gregoriano' },
    year_printed: { type: 'STRING', nullable: true, description: 'Año tal como está impreso si usa otro calendario' },
    mint_mark: { type: 'STRING', nullable: true },
    ruler_or_period: { type: 'STRING', nullable: true, description: 'Soberano, gobierno, retrato o serie' },
    km: { type: 'STRING', nullable: true, description: 'Solo si está escrito en la foto' },
    material: { type: 'STRING', nullable: true, description: 'Composición probable (cobre, plata, bimetálica…)' },
    description: { type: 'STRING', nullable: true, description: 'Una frase: qué se ve en cada cara' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    notes: { type: 'STRING', nullable: true, description: 'Dudas: año gastado, posible variante, cara que falta…' }
  },
  propertyOrdering: ['kind', 'country', 'country_en', 'catalog_country', 'denomination_text', 'value', 'unit', 'year', 'year_printed', 'mint_mark', 'ruler_or_period', 'km', 'material', 'description', 'confidence', 'notes'],
  required: ['kind', 'confidence']
};

// Error con marca de cupo: quota = 'day' (se acabó el diario) · 'minute' (demasiado seguido) · 'limit' (el límite propio de la app)
function identMkErr(status, body) {
  const e = (body && body.error) || {}, msg = e.message || '', det = JSON.stringify(e.details || []), all = msg + ' ' + det;
  let text, quota = '', wait = 0;
  if (status === 400 && /API key not valid|API_KEY_INVALID|key expired|invalid api key/i.test(all)) text = 'La clave de Gemini no es válida. Revísala en "Conexión con la IA" o crea otra en aistudio.google.com/apikey.';
  else if (status === 400 && /location is not supported/i.test(all)) text = 'Gemini no está disponible desde tu ubicación con esta clave.';
  else if (status === 403) text = 'La clave no tiene permiso para usar Gemini. Crea una nueva en aistudio.google.com/apikey.';
  else if (status === 404) text = 'Ese modelo no está disponible para tu clave. Elige otro en "Conexión con la IA".';
  else if (status === 413) text = 'Las fotos pesan demasiado. Prueba con otra más pequeña.';
  else if (status === 429) {
    if (/limit:\s*0\b/.test(all)) text = 'Este modelo no tiene cupo gratuito con tu clave. Prueba con otro (Flash-Lite) en "Conexión con la IA".';
    else if (/PerDay|per day|daily/i.test(all)) { quota = 'day'; text = 'Google dice que ya has agotado el cupo gratuito de hoy. Se renueva sobre las ' + identResetLabel() + '.'; }
    else {
      quota = 'minute';
      const ri = (e.details || []).find(d => /RetryInfo/.test(d['@type'] || '')), m = ri && String(ri.retryDelay || '').match(/([\d.]+)s/);
      wait = m ? Math.ceil(+m[1]) : 0;
      text = 'Demasiadas peticiones seguidas.' + (wait ? ' Espera unos ' + wait + ' segundos' : ' Espera un minuto') + ' e inténtalo de nuevo.';
    }
  }
  else if (status >= 500) text = 'Gemini está saturado ahora mismo. Inténtalo de nuevo en un momento.';
  else text = 'Gemini devolvió un error (' + status + ')' + (msg ? ': ' + msg.slice(0, 160) : '.');
  const err = new Error(text); err.quota = quota; err.status = status; return err;
}

function identSleep(ms, signal) {
  return new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Abort', 'AbortError')); }, { once: true });
  });
}

// path: 'models/xxx:generateContent' (POST con payload) o 'models/xxx' (GET, no gasta cupo)
async function identApi(path, payload, signal) {
  const key = identGetKey();
  if (!key) throw new Error('Falta la clave de Gemini.');
  for (let attempt = 0; ; attempt++) {
    let resp;
    try {
      resp = await fetch(IDENT_BASE + path, {
        method: payload ? 'POST' : 'GET', signal,
        headers: payload ? { 'content-type': 'application/json', 'x-goog-api-key': key } : { 'x-goog-api-key': key },
        body: payload ? JSON.stringify(payload) : undefined
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new Error('No hay conexión con Gemini. Comprueba que tienes internet.');
    }
    let body = null;
    try { body = await resp.json(); } catch (e) {}
    if (resp.ok) return body;
    if (resp.status >= 500 && attempt < 1) { await identSleep(1800, signal); continue; }   // un único reintento si está saturado
    throw identMkErr(resp.status, body);
  }
}

// Comprobación de la clave y del modelo elegido: consulta la ficha del modelo, NO gasta cupo
async function identTestKey() {
  await identApi('models/' + encodeURIComponent(identGetModel()));
  return true;
}

function identParseReading(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let r;
  try { r = JSON.parse(t); } catch (e) { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) { try { r = JSON.parse(t.slice(a, b + 1)); } catch (e2) {} } }
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  if (!r.kind) r.kind = 'coin';
  if (!['high', 'medium', 'low'].includes(r.confidence)) r.confidence = 'medium';
  if (typeof r.value === 'string') { const n = parseFloat(r.value.replace(',', '.')); r.value = isFinite(n) ? n : null; }
  if (typeof r.year === 'string') { const n = parseInt(r.year, 10); r.year = isFinite(n) ? n : null; }
  return r;
}

// photos: [{b64, mime}] (anverso primero). Devuelve { reading, cached }.
async function identReadCoin(photos, signal) {
  const saved = identCacheGet(photos);
  if (saved) return { reading: saved, cached: true };
  if (identRemaining() <= 0) {
    const e = new Error('Hoy has gastado tus ' + identGetLimit() + ' identificaciones gratuitas. Se renuevan sobre las ' + identResetLabel() + '.');
    e.quota = 'limit'; throw e;
  }
  const names = (typeof countries !== 'undefined' ? countries : []).map(c => c.name).filter(Boolean);
  const parts = [];
  photos.forEach((p, i) => {
    parts.push({ text: photos.length > 1 ? (i === 0 ? 'Foto 1 (anverso):' : 'Foto 2 (reverso):') : 'Foto de la moneda:' });
    parts.push({ inlineData: { mimeType: p.mime || 'image/jpeg', data: p.b64 } });
  });
  parts.push({ text: 'Países del catálogo del usuario (para "catalog_country"): ' + (names.length ? names.join(' | ') : '(ninguno)') + '\nIdentifica la moneda.' });
  const body = await identApi('models/' + encodeURIComponent(identGetModel()) + ':generateContent', {
    systemInstruction: { parts: [{ text: IDENT_SYSTEM }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: IDENT_SCHEMA, maxOutputTokens: 4096 }
  }, signal);
  identCountUse();   // la petición se ha servido: cuenta para el cupo del día
  if (body && body.promptFeedback && body.promptFeedback.blockReason) throw new Error('Gemini ha rechazado la foto (' + body.promptFeedback.blockReason + '). Prueba con otra.');
  const cand = body && Array.isArray(body.candidates) ? body.candidates[0] : null;
  const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.filter(p => p.text && !p.thought).map(p => p.text).join('') : '';
  const reading = identParseReading(text);
  if (!reading) throw new Error(cand && cand.finishReason === 'MAX_TOKENS' ? 'La respuesta de Gemini se cortó. Inténtalo de nuevo.' : 'Gemini no devolvió una lectura válida. Inténtalo con otra foto.');
  if (reading.kind === 'coin' || reading.kind === 'token_or_medal') identCachePut(photos, reading);
  return { reading, cached: false };
}

/* ---------- 3) Comparación con la colección ---------- */
function identPlain(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`´]/g, '')
    .replace(/[^a-z0-9£$½¼¾\/.,]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function identWords(s) { return identPlain(s).replace(/[\/.,]+/g, ' ').split(' ').filter(Boolean); }

const IDENT_UNIT_SYN = {};
[
  ['cent', 'cents', 'centavo', 'centavos', 'centimo', 'centimos', 'centime', 'centimes', 'cts', 'ct', 'c', 'centesimo', 'centesimi', 'centesimos'],
  ['dollar', 'dollars', 'dolar', 'dolares', '$', 'usd'],
  ['peseta', 'pesetas', 'pta', 'ptas', 'pts', 'pt'],
  ['franc', 'francs', 'franco', 'francos', 'fr', 'frs', 'franken', 'frank'],
  ['mark', 'marks', 'marco', 'marcos', 'reichsmark', 'deutschmark'],
  ['pfennig', 'pfennige', 'pf'],
  ['pound', 'pounds', 'libra', 'libras', '£', 'lb'],
  ['penny', 'pence', 'pennies', 'penique', 'peniques', 'p', 'd'],
  ['shilling', 'shillings', 'chelin', 'chelines', 's'],
  ['lira', 'lire', 'liras'],
  ['peso', 'pesos'],
  ['real', 'reales', 'reais'],
  ['boliviano', 'bolivianos', 'bs'],
  ['crown', 'crowns', 'corona', 'coronas', 'krone', 'kroner', 'krona', 'kronor', 'koruna', 'korun'],
  ['florin', 'florins'],
  ['gulden', 'guilder', 'guilders'],
  ['thaler', 'taler', 'thalers'],
  ['afghani', 'afghanis', 'afgani', 'afganis'],
  ['leu', 'lei'],
  ['ban', 'bani'],
  ['sovereign', 'sovereigns', 'soberano', 'soberanos'],
  ['rupee', 'rupees', 'rupia', 'rupias', 'rs']
].forEach(g => g.forEach(w => { IDENT_UNIT_SYN[w] = g[0]; }));
function identCanon(w) {
  w = identPlain(w);
  if (!w) return '';
  if (IDENT_UNIT_SYN[w]) return IDENT_UNIT_SYN[w];
  const s = (w.length > 3 && w.endsWith('s')) ? w.slice(0, -1) : w;
  return IDENT_UNIT_SYN[s] || s;
}

const IDENT_NUM_WORDS = { un: 1, una: 1, uno: 1, one: 1, dos: 2, two: 2, tres: 3, three: 3, cuatro: 4, four: 4, cinco: 5, five: 5, seis: 6, six: 6, medio: .5, media: .5, half: .5, cuarto: .25, quarter: .25 };
const IDENT_FRAC = { '½': .5, '¼': .25, '¾': .75 };
// "25 Cents" → {value:25, rest:'Cents'} · "1/2 Penny · George V" → {value:.5, rest:'Penny'} · "Thaler" → {value:null, rest:'Thaler'}
function identParseDenom(raw) {
  let s = String(raw ?? '').split('·')[0].replace(/\(.*?\)/g, ' ').trim(), m, value = null, rest = s;
  if ((m = s.match(/^(\d+)\s*([½¼¾])\s*(.*)$/))) { value = +m[1] + IDENT_FRAC[m[2]]; rest = m[3]; }
  else if ((m = s.match(/^([½¼¾])\s*(.*)$/))) { value = IDENT_FRAC[m[1]]; rest = m[2]; }
  else if ((m = s.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/))) { value = +m[2] ? +m[1] / +m[2] : null; rest = m[3]; }
  else if ((m = s.match(/^(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(.*)$/))) {
    const n = m[1];
    value = /^\d{1,3}([.\s]\d{3})+$/.test(n) ? +n.replace(/[.\s]/g, '') : +n.replace(',', '.');
    rest = m[2];
  } else if ((m = s.match(/^([A-Za-zÀ-ÿ]+)\s+(.*)$/)) && IDENT_NUM_WORDS[identPlain(m[1])] !== undefined) { value = IDENT_NUM_WORDS[identPlain(m[1])]; rest = m[2]; }
  return { value: (value !== null && isFinite(value)) ? value : null, rest: rest.trim() };
}

function identYear(y) { const n = parseInt(y, 10); return (n >= 1 && n <= 2200) ? n : null; }
// true = dentro del rango · false = fuera · null = el rango no tiene años (S/F…) o no se leyó el año
function identYearInRange(range, year) {
  if (year == null) return null;
  const s = String(range ?? ''), ys = (s.match(/\b\d{4}\b/g) || []).map(Number);
  if (!ys.length) return null;
  const now = new Date().getFullYear();
  if (ys.includes(year)) return true;
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (/ACT/i.test(s)) hi = Math.max(hi, now);
  return year >= lo && year <= hi;
}

const IDENT_STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'serie', 'retrato', 'er', 'do', 'to', 'ro', 'th', 'the', 'of', 'and', 'y', 'i', 'ii']);
function identTokens(s) { return identWords(s).filter(w => w.length >= 3 && !IDENT_STOP.has(w) && !/^\d+$/.test(w) && !/^\d+(er|do|to|ro|ta|vo|no)$/.test(w)); }

function identFindCountry(r) {
  const names = [r.catalog_country, r.country, r.country_en].map(identPlain).filter(Boolean);
  if (!names.length) return null;
  const cs = countries.map(c => ({ c, n: identPlain(c.name) }));
  for (const n of names) { const hit = cs.find(x => x.n === n); if (hit) return hit.c; }
  for (const n of names) {   // nombre contenido (palabras completas) y único: "Samoa" ⊂ "Samoa Occidental"
    const hits = cs.filter(x => x.n && (` ${n} `.includes(` ${x.n} `) || ` ${x.n} `.includes(` ${n} `)));
    if (hits.length === 1) return hits[0].c;
  }
  return null;
}

/* Devuelve { country, strong:[cand], weak:[cand], why }
   · strong: mismo país y valor facial, misma unidad (o sin dato) y el año cae en el rango (o no se leyó / el rango no tiene años)
   · weak:   mismo país y valor facial pero el año queda FUERA del rango de la ficha o la unidad monetaria es distinta ("parecidas")
   · why:    '' | 'country' (país no está en el catálogo) | 'value' (no se leyó el valor) */
function identMatchReading(r) {
  const out = { country: null, strong: [], weak: [], why: '' };
  if (!r) return out;
  const country = identFindCountry(r);
  out.country = country;
  if (!country) { out.why = 'country'; return out; }
  const dn = identParseDenom(r.denomination_text || '');
  const value = (typeof r.value === 'number' && isFinite(r.value)) ? r.value : dn.value;
  if (value == null) { out.why = 'value'; return out; }
  const unitStr = [r.unit, dn.rest].filter(Boolean).join(' ');
  const readUnits = identWords(unitStr).map(identCanon).filter(w => w && isNaN(w));
  const year = identYear(r.year);
  const kmR = r.km ? kmKey(r.km) : null;
  const ruler = new Set(identTokens(r.ruler_or_period));

  coins.filter(c => c.countryId === country.id).forEach(c => {
    const cd = identParseDenom(c.denom), cv = cd.value == null ? 1 : cd.value;
    if (Math.abs(cv - value) > 1e-6) return;
    const reasons = [{ ok: true, t: 'Denominación' }];
    let score = 50;
    // unidad monetaria
    const catUnits = identWords(cd.rest).map(identCanon).filter(w => w && isNaN(w));
    let unit = 'unknown';
    if (catUnits.length && readUnits.length) {
      unit = readUnits.some(u => catUnits.includes(u) || catUnits.some(t => t.length >= 3 && u.length >= 3 && (t.startsWith(u) || u.startsWith(t)))) ? 'yes' : 'no';
    }
    if (unit === 'yes') score += 30; else if (unit === 'unknown') score += 10; else { score -= 20; reasons[0] = { ok: false, t: 'Unidad distinta (' + (cd.rest || '—') + ')' }; }
    // año
    const inR = identYearInRange(c.range, year);
    let yearState = 'unknown';
    if (inR === true) { score += 30; yearState = 'in'; reasons.push({ ok: true, t: 'Año ' + year + ' dentro del rango' }); }
    else if (inR === false) { yearState = 'out'; reasons.push({ ok: false, t: 'Año ' + year + ' fuera del rango ' + (c.range || '') }); }
    else { score += 8; if (year == null) reasons.push({ ok: null, t: 'Año no leído' }); }
    // KM#
    if (kmR) {
      const kc = kmKey(c.km);
      if (kc && kc.base === kmR.base && kc.suffix === kmR.suffix) { score += 40; reasons.push({ ok: true, t: 'KM# coincide' }); }
      else if (kc && kc.base === kmR.base) { score += 25; reasons.push({ ok: true, t: 'KM# base coincide' }); }
      else if (kc) { score -= 25; reasons.push({ ok: false, t: 'KM# distinto (' + c.km + ')' }); }
    }
    // soberano / retrato / serie
    if (ruler.size) {
      const hay = new Set(identTokens([coinPeriodName(c), String(c.denom || '').split('·')[1] || '', c.cecaMaterial || ''].join(' ')));
      let n = 0; ruler.forEach(t => { if (hay.has(t)) n++; });
      if (n) { score += Math.min(16, 8 * n); reasons.push({ ok: true, t: 'Soberano / serie coincide' }); }
    }
    // "débil" = mismo valor facial pero no cuadra del todo (año fuera del rango o unidad monetaria distinta): solo se ofrece como "parecida"
    const weak = unit === 'no' ? 'unit' : (yearState === 'out' ? 'year' : '');
    const cand = { coin: c, score, yearState, unit, weak, reasons };
    (weak ? out.weak : out.strong).push(cand);
  });
  const byScore = (a, b) => (b.score - a.score) || ((a.coin.order ?? 0) - (b.coin.order ?? 0));
  out.strong.sort(byScore); out.weak.sort(byScore);
  return out;
}

/* ---------- 4) ¿La tengo? ---------- */
// state: 'have' (tengo ese tipo, sea del año que sea) · 'missing' (no la tengo)
// note : '' · 'noyear' (no se leyó el año) · 'itemnoyear' (mi ejemplar no tiene año anotado) · 'otheryear'
function identOwnership(r, coin) {
  const items = (Array.isArray(coin.items) ? coin.items : []).filter(i => i && String(i.grade || '').trim() !== '');
  const years = [...new Set(items.map(i => String(i.year || '').trim()).filter(Boolean))].sort();
  if (!items.length) return { state: 'missing', items: [], years: [], note: '' };
  const year = identYear(r && r.year);
  if (year == null) return { state: 'have', items, years, note: 'noyear' };
  const exact = items.filter(i => String(i.year || '').trim() === String(year));
  if (exact.length) return { state: 'have', items: exact, years, note: '' };
  if (!years.length) return { state: 'have', items, years, note: 'itemnoyear' };
  return { state: 'have', items, years, note: 'otheryear' };   // se colecciona por KM#: tener el tipo de otro año cuenta como "la tengo"
}
