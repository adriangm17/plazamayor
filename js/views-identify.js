/* ===== PESTAÑA IDENTIFICACIÓN =====
   Foto (anverso y, si quieres, reverso) → la IA lee la moneda → se compara con tu colección → tres resultados:
     LA TENGO (mismo tipo y mismo año) · NO LA TENGO (no está conseguida o tengo el tipo pero de otro año) · NO REGISTRADA (no está en el catálogo).
   El resultado se calcula siempre a partir de la lectura + la colección actual, así que si añades la moneda al catálogo o la marcas como conseguida, vuelve a calcularse. */
let identStage = 'capture';          // capture | loading | result
let identPhotos = { front: null, back: null };   // { b64, mime, preview }
let identReading = null;             // lectura de la IA (editable por el usuario)
let identSel = '';                   // '' = la mejor coincidencia · id de ficha elegida · '__none' = ninguna de las coincidencias
let identErr = '';
let identAbort = null;
let identEditOpen = false;
let identCfgOpen = false;
let identCfgMsg = null;              // { ok, text }
let identFromCache = false;          // la lectura salió de las guardadas (no gastó cupo)
let identQuotaHit = false;           // se agotó el cupo: se ofrece el plan B (Lens + datos a mano)

const identSideLabel = { front: 'Anverso', back: 'Reverso' };
const identConfLabel = { high: 'Alta', medium: 'Media', low: 'Baja' };

/* ---------- Estado / navegación ---------- */
function identGoStage(stage) {
  identStage = stage;
  if (stage !== 'result') { identEditOpen = false; }
  render();
}
function identStageKey() { return identStage === 'result' ? 'r' : ''; }
function identNewPhoto() {
  identPhotos = { front: null, back: null }; identReading = null; identSel = ''; identErr = ''; identEditOpen = false;
  identGoStage('capture');
}

/* ---------- Fotos ---------- */
async function identPickFile(side, input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  identErr = '';
  try { identPhotos[side] = await identPrepareImage(file); }
  catch (e) { identErr = 'No se pudo leer esa imagen. Prueba con otra (JPG o PNG).'; }
  renderIdentificar();
}
function identClearPhoto(side) { identPhotos[side] = null; identErr = ''; renderIdentificar(); }

/* ---------- Conexión con la IA ---------- */
function identToggleCfg() { identCfgOpen = !identCfgOpen; renderIdentificar(); }
function identSaveCfg() {
  const g = id => (document.getElementById(id) || {}).value || '';
  const k = g('ident-key').trim();
  if (k) {
    if (/^sk-ant-/.test(k)) { identCfgMsg = { ok: false, text: 'Esa es una clave de Anthropic. Aquí hace falta una de Gemini (gratis): aistudio.google.com/apikey.' }; renderIdentificar(); return; }
    if (k.length < 20 || /\s/.test(k)) { identCfgMsg = { ok: false, text: 'Esa clave no parece completa. Cópiala entera desde AI Studio.' }; renderIdentificar(); return; }
    identSetKey(k);
  }
  identSetModel(g('ident-model'), g('ident-custom'));
  identSetLimit(g('ident-limit'));
  identCfgMsg = { ok: true, text: identGetKey() ? 'Guardado. Pulsa "Probar" para comprobar que funciona (no gasta cupo).' : 'Falta pegar la clave.' };
  if (identGetKey()) identCfgOpen = false;
  renderIdentificar();
}
function identForgetKey() { if (!confirm('¿Borrar la clave guardada en este dispositivo?')) return; identSetKey(''); identCfgMsg = null; identCfgOpen = true; renderIdentificar(); }
function identZeroUsage() { identResetUsage(); identQuotaHit = false; identErr = ''; renderIdentificar(); }
async function identRunTest() {
  const typed = (document.getElementById('ident-key') || {}).value;
  if (typed && typed.trim()) { identSaveCfg(); if (!identGetKey()) return; identCfgOpen = true; }
  else { const g = id => (document.getElementById(id) || {}).value; if (g('ident-model')) { identSetModel(g('ident-model'), g('ident-custom')); identSetLimit(g('ident-limit')); } }
  identCfgMsg = { ok: null, text: 'Probando…' }; renderIdentificar();
  try { await identTestKey(); identCfgMsg = { ok: true, text: '✓ Conexión correcta con ' + identModelLabel() + '. Esta comprobación no gasta cupo.' }; }
  catch (e) { identCfgMsg = { ok: false, text: e.message || 'No se pudo conectar.' }; }
  identCfgOpen = true; renderIdentificar();
}

/* ---------- Plan B: sin cupo o sin clave ---------- */
function identBlankReading() {
  return { kind: 'coin', country: null, country_en: null, catalog_country: null, denomination_text: null, value: null, unit: null, year: null, year_printed: null,
    mint_mark: null, ruler_or_period: null, km: null, material: null, description: null, confidence: 'high', notes: null, manual: true };
}
function identManual() {
  identReading = identBlankReading(); identSel = ''; identErr = ''; identFromCache = false;
  identGoStage('result');
  identEditOpen = true; renderIdentificar();
}
function identOpenLens() { window.open('https://lens.google.com/', '_blank', 'noopener'); }

/* ---------- Identificar ---------- */
async function identStart() {
  if (!identPhotos.front && !identPhotos.back) return;
  if (!identGetKey()) { identCfgOpen = true; identErr = 'Primero conecta Gemini (más abajo) o usa los datos a mano.'; renderIdentificar(); return; }
  identErr = ''; identSel = ''; identEditOpen = false; identQuotaHit = false; identFromCache = false;
  identAbort = new AbortController();
  identGoStage('loading');
  try {
    const photos = [identPhotos.front, identPhotos.back].filter(Boolean);
    const { reading, cached } = await identReadCoin(photos, identAbort.signal);
    if (identStage !== 'loading') return;   // cancelado mientras tanto
    if (reading.kind === 'not_a_coin' || reading.kind === 'unreadable' || reading.kind === 'banknote') {
      identErr = reading.kind === 'banknote' ? 'Eso parece un billete, no una moneda.' :
        (reading.notes ? 'No he podido identificar una moneda en la foto: ' + reading.notes : 'No he podido identificar una moneda en la foto. Prueba con más luz y la moneda llenando el encuadre.');
      identGoStage('capture'); return;
    }
    identReading = reading; identFromCache = !!cached;
    identGoStage('result');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    if (e && (e.quota === 'day' || e.quota === 'limit')) { identQuotaHit = true; if (e.quota === 'day') identMarkExhausted(); }
    identErr = (e && e.message) || 'No se pudo identificar la moneda.';
    identGoStage('capture');
  } finally { identAbort = null; }
}
function identCancel() { if (identAbort) identAbort.abort(); identAbort = null; identGoStage('capture'); }

/* ---------- Acciones del resultado ---------- */
function identPick(id) { identSel = id; renderIdentificar(); }
function identToggleEdit() { identEditOpen = !identEditOpen; renderIdentificar(); }
function identApplyEdit() {
  const g = id => (document.getElementById(id) || {}).value || '';
  const r = identReading;
  r.country = g('ide-country').trim() || null; r.country_en = null; r.catalog_country = null;
  const dn = g('ide-denom').trim();
  r.denomination_text = dn || null;
  const p = identParseDenom(dn);
  r.value = p.value; r.unit = p.rest || null;
  r.year = identYear(g('ide-year')); r.year_printed = null;
  r.km = g('ide-km').trim() || null;
  r.ruler_or_period = g('ide-ruler').trim() || null;
  r.manual = false;
  identSel = ''; identEditOpen = false;
  renderIdentificar();
}
function identOpenCoin(id) { openCoinModal(id); }
function identAddToCatalog() {
  const r = identReading, c = identMatchReading(r).country;
  openCreateModal();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('new-country', c ? c.name : (r.country || '').toUpperCase());
  set('new-period', r.ruler_or_period || '');
  const dn = r.denomination_text || [r.value, r.unit].filter(x => x != null && x !== '').join(' ');
  set('new-denom', dn.replace(/\b([A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ]*)/g, (m, a, b) => a.toUpperCase() + b.toLowerCase()));
  set('new-ceca-material', r.mint_mark ? ('Ceca ' + r.mint_mark) : '');
  set('new-km', r.km || '');
  set('new-range', identYear(r.year) ? String(identYear(r.year)) : '');
}
function identNumistaUrl() {
  const r = identReading;
  const q = [r.value != null ? r.value : '', r.unit || '', r.country_en || r.country || '', identYear(r.year) || ''].join(' ').replace(/\s+/g, ' ').trim();
  return 'https://es.numista.com/catalogue/index.php?r=' + encodeURIComponent(q) + '&ct=coin';
}
function identOpenNumista() { window.open(identNumistaUrl(), '_blank', 'noopener'); }

/* ---------- Pintado ---------- */
function renderIdentificar() {
  const box = document.getElementById('identificar-content');
  if (!box) return;
  if (identStage === 'result' && !identReading) identStage = 'capture';
  box.innerHTML = identStage === 'loading' ? identLoadingHtml() : identStage === 'result' ? identResultHtml() : identCaptureHtml();
  hydrateImages(box);
  if (typeof navSync === 'function') navSync();
}

function identSlotHtml(side) {
  const p = identPhotos[side], label = identSideLabel[side];
  return `<div class="xd-slot${p ? ' xd-has' : ''}">
    <label class="xd-shot" aria-label="${label}: hacer foto">
      ${p ? `<img src="${p.preview}" alt="${label}">` : `<i class="fa-solid fa-camera"></i>`}
      <input type="file" accept="image/*" capture="environment" onchange="identPickFile('${side}',this)">
    </label>
    <span class="xd-slot-name">${label}${side === 'back' ? ' <em>(opcional)</em>' : ''}</span>
    <div class="xd-slot-btns">
      <label class="xd-sbtn" title="Elegir de la galería"><i class="fa-solid fa-images"></i> Galería<input type="file" accept="image/*" onchange="identPickFile('${side}',this)"></label>
      ${p ? `<button type="button" class="xd-sbtn xd-sbtn-x" onclick="identClearPhoto('${side}')" aria-label="Quitar foto"><i class="fa-solid fa-xmark"></i></button>` : ''}
    </div>
  </div>`;
}

function identQuotaLine() {
  const lim = identGetLimit(), used = identUsage().n, rem = identRemaining();
  return { lim, used, rem, text: 'Hoy: ' + Math.min(used, lim) + ' de ' + lim + ' · se renueva sobre las ' + identResetLabel() };
}

function identCfgHtml() {
  const key = identGetKey(), open = identCfgOpen || !key, model = identGetPreset(), custom = identGetCustomModel();
  const q = identQuotaLine();
  const msg = identCfgMsg ? `<p class="xd-cfgmsg ${identCfgMsg.ok === true ? 'xd-ok' : identCfgMsg.ok === false ? 'xd-bad' : ''}">${esc(identCfgMsg.text)}</p>` : '';
  return `<div class="xs-panel xd-cfg">
    <button type="button" class="xd-cfg-head" onclick="identToggleCfg()" aria-expanded="${open}">
      <span class="xd-cfg-t"><i class="fa-solid fa-plug"></i> Conexión con la IA</span>
      <span class="xd-cfg-s ${key ? 'xd-ok' : 'xd-bad'}">${key ? 'Gratis · ' + q.rem + ' hoy' : 'Sin configurar'}</span>
      <i class="fa-solid fa-chevron-${open ? 'up' : 'down'}"></i>
    </button>
    ${open ? `<div class="xd-cfg-body">
      <p class="xd-small">Usa <b>Gemini</b> (Google) con una clave <b>gratuita y sin tarjeta</b>: entra en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> con tu cuenta de Google, pulsa <b>Create API key</b> y pégala aquí. Cada identificación (con una o dos fotos) gasta 1 petición; Google fija un cupo diario gratuito y puede cambiarlo, así que la app lleva la cuenta y te avisa. La foto se envía a Google y la clave se queda solo en este dispositivo (no entra en las copias de seguridad).</p>
      <div class="xe-f"><label>Clave de Gemini</label>
        <input type="password" id="ident-key" class="xe-in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${key ? 'Guardada (termina en ' + esc(key.slice(-4)) + ') · pega otra para cambiarla' : 'AIza…'}"></div>
      <div class="xe-f"><label>Modelo</label>
        <select id="ident-model" class="xe-in">${IDENT_MODELS.map(m => `<option value="${m.id}"${m.id === model ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</select></div>
      <div class="xe-f"><label>Otro modelo (opcional)</label>
        <input type="text" id="ident-custom" class="xe-in" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(custom)}" placeholder="Solo si Google retira el de arriba"></div>
      <div class="xe-f"><label>Límite diario que me marco</label>
        <input type="number" id="ident-limit" class="xe-in" inputmode="numeric" min="1" max="1000" value="${q.lim}">
        <small class="xd-small">El cupo real de tu proyecto lo ves en AI Studio. Si Google lo recorta, baja este número.</small></div>
      <p class="xd-small"><i class="fa-solid fa-gauge"></i> ${esc(q.text)} <button type="button" class="xd-link" onclick="identZeroUsage()">Poner a 0</button></p>
      <div class="xd-cfg-btns">
        <button type="button" class="xe-btn xe-main" onclick="identSaveCfg()">Guardar</button>
        <button type="button" class="xe-btn xe-soft" onclick="identRunTest()">Probar</button>
        ${key ? `<button type="button" class="xe-btn xe-soft" onclick="identForgetKey()">Borrar clave</button>` : ''}
      </div>${msg}</div>` : ''}
  </div>`;
}

function identPlanBHtml() {
  return `<div class="xs-panel xd-planb">
    <b><i class="fa-solid fa-life-ring"></i> Plan B sin gastar cupo</b>
    <p class="xd-small">Google Lens no tiene conexión posible con la app, pero puedes usarlo a mano: ábrelo, sube la foto y escribe aquí lo que lea. La comparación con tu colección la hago yo, sin IA y sin límite.</p>
    <div class="xd-cfg-btns">
      <button type="button" class="xe-btn xe-soft" onclick="identOpenLens()"><i class="fa-solid fa-camera-retro"></i> Abrir Google Lens</button>
      <button type="button" class="xe-btn xe-main" onclick="identManual()"><i class="fa-solid fa-pen"></i> Escribir los datos</button>
    </div>
  </div>`;
}

function identCaptureHtml() {
  const has = !!(identPhotos.front || identPhotos.back), key = !!identGetKey(), q = identQuotaLine();
  const planB = !key || q.rem <= 0 || identQuotaHit;
  const pill = key ? `<p class="xd-quota${q.rem <= 0 ? ' xd-q0' : q.rem <= 3 ? ' xd-q-low' : ''}"><i class="fa-solid fa-gauge"></i> ${q.rem > 0 ? 'Te quedan <b>' + q.rem + '</b> identificaciones gratis hoy' : 'Cupo de hoy agotado · se renueva sobre las ' + esc(identResetLabel())}</p>` : '';
  return `<div class="xd">
    <div class="xd-head">
      <span class="xs-kicker block">Identificación</span>
      <h2 class="xs-h1">¿La tengo?</h2>
      <p class="xd-lead">Haz una foto a la moneda y la comparo con tu colección.</p>
    </div>
    ${pill}
    ${identErr ? `<div class="xd-err" role="alert"><i class="fa-solid fa-triangle-exclamation"></i><span>${esc(identErr)}</span></div>` : ''}
    <div class="xd-slots">${identSlotHtml('front')}${identSlotHtml('back')}</div>
    <button type="button" class="xd-go" onclick="identStart()" ${has && key ? '' : 'disabled'}><i class="fa-solid fa-wand-magic-sparkles"></i> Identificar</button>
    ${!has ? `<p class="xd-hint">Toca el círculo para abrir la cámara.</p>` : (!key ? `<p class="xd-hint">Falta conectar Gemini (abajo) o usar los datos a mano.</p>` : (!identPhotos.back ? `<p class="xd-hint">Con el reverso también, la lectura es más fiable (sigue gastando solo 1).</p>` : ''))}
    ${planB ? identPlanBHtml() : ''}
    <div class="xs-panel xd-tips">
      <b><i class="fa-solid fa-lightbulb"></i> Para acertar más</b>
      <ul><li>Luz natural, sin flash, sobre un fondo liso.</li><li>La moneda llenando el encuadre y bien enfocada.</li><li>Año y leyenda legibles: inclina un poco si hay reflejos.</li><li>Antes de pulsar Identificar, comprueba que las fotos salen bien: si repites la misma foto no gasta cupo, pero otra distinta sí.</li></ul>
    </div>
    ${identCfgHtml()}
  </div>`;
}

function identLoadingHtml() {
  const th = [identPhotos.front, identPhotos.back].filter(Boolean).map(p => `<img src="${p.preview}" alt="">`).join('');
  return `<div class="xd xd-load">
    <div class="xd-spin"><div class="xd-ring"></div><div class="xd-thumbs">${th}</div></div>
    <h2 class="xs-h2">Leyendo la moneda…</h2>
    <p class="xd-lead">Estoy leyendo país, denominación y año, y comparándolos con tu colección. Suele tardar unos segundos.</p>
    <button type="button" class="xe-btn xe-soft xd-cancel" onclick="identCancel()">Cancelar</button>
  </div>`;
}

/* --- resultado --- */
function identKv(label, value) {
  const v = (value === null || value === undefined || value === '') ? '<i class="xd-na">—</i>' : esc(String(value));
  return `<div class="xd-kv"><span>${esc(label)}</span><b>${v}</b></div>`;
}

function identHeroHtml(cand, verdict) {
  const mine = identPhotos.front || identPhotos.back;
  const photo = (p, cap) => `<div class="xd-cell"><div class="xd-ph">${p ? `<img src="${p.preview}" alt="${esc(cap)}">` : `<i class="fa-solid fa-circle-question"></i>`}</div><small>${esc(cap)}</small></div>`;
  if (cand) {
    const c = cand.coin, side = c.hasFront ? 'front' : (c.hasBack ? 'back' : ''), has = !!side;
    const coinEl = `<div class="xd-cell"><div class="xf-coin ${has ? 'has-img' : 'coin-base-style'}">${has ? imgTag(c.id, side) : `<span class="xm-fallback">${esc(c.denom)}</span>`}</div><small>En tu catálogo</small></div>`;
    return `<div class="xf-hero xd-hero"><div class="xf-coins">${photo(mine, 'Tu foto')}${coinEl}</div></div>`;
  }
  return `<div class="xf-hero xd-hero"><div class="xf-coins">${photo(identPhotos.front || identPhotos.back, identPhotos.front ? 'Anverso' : 'Reverso')}${identPhotos.front && identPhotos.back ? photo(identPhotos.back, 'Reverso') : photo(null, 'Sin reverso')}</div></div>`;
}

function identCatalogInfoHtml(c) {
  const country = countryById(c.countryId), type = coinType(c), tcol = COIN_TYPE_COLORS[type] || COIN_TYPE_COLORS[DEFAULT_COIN_TYPE];
  const rar = c.rarity ? String(c.rarity).toUpperCase() : '';
  const mat = (c.cecaMaterial || '').trim();
  return `<div class="xf-info">
    <div class="xf-r">
      <span class="xf-pill xf-dark xf-grow">${esc(coinCountryName(c))}</span>
      <span class="xf-pill xf-km">${esc(c.km || 'KM# -')}</span>
      ${rar ? `<span class="xf-chip" style="${getRarityStyle(c.rarity)}">${rar === 'PLATA' ? 'AG' : esc(rar)}</span>` : ''}
    </div>
    <div class="xf-r">
      <span class="xf-pill xf-line xf-yr">${esc(formatYearRange(c.range))}</span>
      <span class="xf-pill xf-dark xf-grow">${esc(coinPeriodName(c))}</span>
    </div>
    <div class="xf-r">
      ${country ? `<span class="xf-flag" style="background:${flagLayers(country)}"></span>` : ''}
      <span class="xf-pill xf-line xf-grow">${esc(mat || c.denom)}</span>
      <span class="xf-chip xd-type" style="background:${tcol}">${esc(type.toUpperCase())}</span>
    </div>
  </div>`;
}

function identReadingInfoHtml(r, country) {
  const yr = identYear(r.year);
  return `<div class="xf-info">
    <div class="xf-r">
      <span class="xf-pill xf-dark xf-grow">${esc(country ? country.name : (r.country || 'País ?'))}</span>
      ${r.km ? `<span class="xf-pill xf-km">${esc(r.km)}</span>` : ''}
    </div>
    <div class="xf-r">
      <span class="xf-pill xf-line xf-yr">${yr ? yr : 'Año ?'}</span>
      <span class="xf-pill xf-dark xf-grow">${esc(r.denomination_text || [r.value, r.unit].filter(x => x != null && x !== '').join(' ') || 'Denominación ?')}</span>
    </div>
    <div class="xf-r">
      ${country ? `<span class="xf-flag" style="background:${flagLayers(country)}"></span>` : ''}
      <span class="xf-pill xf-line xf-grow">${esc(r.ruler_or_period || r.material || '—')}</span>
      ${r.mint_mark ? `<span class="xf-chip xd-type" style="background:var(--xp-sand-l)">CECA ${esc(String(r.mint_mark).toUpperCase())}</span>` : ''}
    </div>
  </div>`;
}

function identMineHtml(own) {
  const rows = own.items.map(i => `<div class="xd-item">
      <span class="xd-iy">${esc(i.year || 'S/A')}</span>
      <span class="xd-ig">${esc(i.grade || '—')}</span>
      <span class="xd-if" title="${esc((ITEM_FORMATS.find(f => f.id === i.format) || ITEM_FORMATS[0]).label)}">${itemFormatIcon(i.format, 20)}</span>
      <span class="xd-inote">${esc(i.notes || '')}</span>
    </div>`).join('');
  return `<div class="xf-card xf-mine"><div class="xd-mine-t">TU${own.items.length > 1 ? 'S' : ''} EJEMPLAR${own.items.length > 1 ? 'ES' : ''}</div>${rows}</div>`;
}

function identAltsHtml(m, cand, verdict) {
  const all = [...m.strong, ...m.weak];
  const show = all.length > 0 && (m.strong.length > 1 || verdict === 'unreg' || (cand && cand.weak));
  if (!show) return '';
  const selId = cand ? cand.coin.id : '';
  const title = verdict === 'unreg' ? (identSel === '__none' ? 'Coincidencias descartadas' : 'Parecidas en tu catálogo (no cuadran del todo)') : (m.strong.length > 1 ? 'Hay varias coincidencias — elige la tuya' : 'Coincidencia por aproximación');
  const items = all.slice(0, 8).map(a => {
    const c = a.coin, side = c.hasFront ? 'front' : (c.hasBack ? 'back' : '');
    return `<button type="button" class="xd-alt${c.id === selId ? ' xd-on' : ''}${c.acquired ? ' xd-own' : ''}" onclick="identPick('${jsArg(c.id)}')">
      <span class="xd-alt-img">${side ? imgTag(c.id, side) : `<em>${esc(c.denom)}</em>`}</span>
      <span class="xd-alt-t"><b>${esc(c.denom)}</b><small>${esc(formatYearRange(c.range))} · ${esc(c.km || 'KM# -')}</small>${a.weak ? `<small class="xd-alt-w">${a.reasons.filter(x => x.ok === false).map(x => esc(x.t)).join(' · ')}</small>` : ''}</span>
      ${c.acquired ? '<i class="fa-solid fa-circle-check xd-alt-ck"></i>' : ''}
    </button>`;
  }).join('');
  let tail = '';
  if (verdict !== 'unreg') tail = `<button type="button" class="xd-none" onclick="identPick('__none')"><i class="fa-solid fa-ban"></i> Ninguna de estas · no está en mi catálogo</button>`;
  else if (identSel === '__none') tail = `<button type="button" class="xd-none" onclick="identPick('')"><i class="fa-solid fa-rotate-left"></i> Volver a las coincidencias</button>`;
  return `<div class="xs-panel xd-alts"><div class="xd-alts-t">${title}</div><div class="xd-alts-l">${items}</div>${tail}</div>`;
}

function identEditHtml(r, country) {
  const dn = r.denomination_text || [r.value, r.unit].filter(x => x != null && x !== '').join(' ');
  return `<div class="xd-edit">
    <div class="xe-grid">
      <div class="xe-f xe-c6"><label>País</label><input type="text" id="ide-country" class="xe-in" value="${esc(country ? country.name : (r.country || ''))}"></div>
      <div class="xe-f xe-c6"><label>Denominación</label><input type="text" id="ide-denom" class="xe-in" value="${esc(dn)}" placeholder="Ej: 25 Cents"></div>
      <div class="xe-f xe-c4"><label>Año</label><input type="number" inputmode="numeric" id="ide-year" class="xe-in" value="${identYear(r.year) || ''}" placeholder="Ej: 1990"></div>
      <div class="xe-f xe-c4"><label>KM# (opcional)</label><input type="text" id="ide-km" class="xe-in" value="${esc(r.km || '')}" placeholder="Ej: KM# 34"></div>
      <div class="xe-f xe-c4"><label>Soberano / serie</label><input type="text" id="ide-ruler" class="xe-in" value="${esc(r.ruler_or_period || '')}"></div>
    </div>
    <div class="xd-cfg-btns"><button type="button" class="xe-btn xe-main" onclick="identApplyEdit()"><i class="fa-solid fa-rotate"></i> Volver a comprobar</button></div>
  </div>`;
}

function identResultHtml() {
  const r = identReading, m = identMatchReading(r), all = [...m.strong, ...m.weak];
  let cand = null;
  if (identSel === '__none') cand = null;
  else if (identSel) cand = all.find(x => x.coin.id === identSel) || null;
  else cand = m.strong[0] || null;
  if (identSel && identSel !== '__none' && !cand) identSel = '';   // la ficha elegida ya no existe
  const own = cand ? identOwnership(r, cand.coin) : null;
  const verdict = !cand ? 'unreg' : own.state;
  const yr = identYear(r.year), dnText = r.denomination_text || [r.value, r.unit].filter(x => x != null && x !== '').join(' ');

  const V = r.manual ? { cls: 'xd-v-unreg', icon: 'pen-to-square', txt: 'ESCRIBE LOS DATOS' } : {
    have:    { cls: 'xd-v-have', icon: 'circle-check', txt: 'LA TENGO' },
    missing: { cls: 'xd-v-miss', icon: 'circle-xmark', txt: 'NO LA TENGO' },
    unreg:   { cls: 'xd-v-unreg', icon: 'circle-question', txt: 'NO REGISTRADA' }
  }[verdict];

  let why = '';
  if (verdict === 'have') {
    const a = own.items.map(i => `${i.year || 's/año'}${i.grade ? ' (' + i.grade + ')' : ''}`).join(', ');
    why = own.note === 'noyear' ? `No he podido leer el año. Tienes este tipo${own.years.length ? ' (años: ' + own.years.join(', ') + ')' : ''}: comprueba si es el mismo ejemplar.` :
          own.note === 'itemnoyear' ? 'Tienes este tipo, pero tu ejemplar no tiene el año anotado.' :
          own.note === 'otheryear' ? `La tienes: tu ejemplar es de ${a}. La de la foto es de ${yr}, otro año del mismo tipo.` :
          `La tienes, es del ${a}.`;
  } else if (verdict === 'missing') {
    why = own.note === 'otheryear' ? `Tienes este tipo, pero de otro año (${own.years.join(', ')}). El ${yr} te falta.` :
          'Está en tu catálogo, pero todavía no la has conseguido.';
  } else {
    const cn = m.country ? m.country.name : (r.country || 'ese país');
    why = m.why === 'country' ? `${cn} no está en tu catálogo.` :
          m.why === 'value' ? 'No he podido leer la denominación: corrígela abajo y vuelvo a comprobar.' :
          identSel === '__none' ? 'Has descartado las coincidencias: no está en tu catálogo.' :
          m.weak.length ? `${cn} está en tu catálogo, pero ninguna ficha encaja${yr ? ' con el año ' + yr : ''}. Abajo tienes las más parecidas.` :
          `${cn} está en tu catálogo, pero no hay esta denominación${yr ? ' con el año ' + yr : ''}.`;
  }
  if (cand && cand.weak === 'year') why += ` Ojo: el año ${yr} queda fuera del rango de esta ficha (${cand.coin.range}).`;
  if (cand && cand.weak === 'unit') why += ' Ojo: la unidad monetaria no coincide con la de esta ficha.';

  if (cand && m.strong.length > 1 && !identSel) why = `Hay ${m.strong.length} fichas posibles; este resultado es para la primera. Elige la tuya más abajo. ` + why;
  if (r.manual) why = 'Mira la moneda (o lo que te diga Google Lens) y rellena país, denominación y año; luego pulsa "Volver a comprobar".';
  const conf = r.confidence || 'medium';
  const lowConf = conf === 'low' && !r.manual;
  const rem = identRemaining();
  const quotaNote = r.manual ? '' : (identFromCache ? '<i class="fa-solid fa-bolt"></i> Lectura guardada de antes: no ha gastado cupo.' : (identGetKey() ? '<i class="fa-solid fa-gauge"></i> Gastó 1 identificación · te quedan ' + rem + ' hoy.' : ''));
  return `<div class="xd xd-result">
    ${identHeroHtml(cand, verdict)}
    <div class="xf-titlebox"><h2 class="xf-title xd-verdict ${V.cls}"><i class="fa-solid fa-${V.icon}"></i> ${V.txt}</h2></div>
    <p class="xd-why">${esc(why)}</p>
    ${lowConf ? `<div class="xd-err xd-warn"><i class="fa-solid fa-triangle-exclamation"></i><span>Lectura poco segura: revisa los datos de abajo antes de fiarte del resultado.</span></div>` : ''}
    ${cand ? identCatalogInfoHtml(cand.coin) : identReadingInfoHtml(r, m.country)}
    ${verdict === 'have' ? identMineHtml(own) : ''}
    ${identAltsHtml(m, cand, verdict)}
    <div class="xs-panel xd-read">
      <div class="xd-read-h"><span class="xs-kicker">${r.manual ? 'Datos escritos a mano' : 'Lo que he leído en la foto'}</span>
        ${r.manual ? '' : `<span class="xd-conf xd-conf-${esc(conf)}">Confianza ${esc(identConfLabel[conf] || conf)}</span>`}</div>
      <div class="xd-kvs">
        ${identKv('País', (m.country && m.country.name) || r.country)}
        ${identKv('Denominación', dnText)}
        ${identKv('Año', yr ? yr + (r.year_printed && String(r.year_printed) !== String(yr) ? ' (impreso: ' + r.year_printed + ')' : '') : null)}
        ${identKv('Soberano / serie', r.ruler_or_period)}
        ${identKv('Ceca', r.mint_mark)}
        ${identKv('Material', r.material)}
        ${identKv('KM#', r.km)}
      </div>
      ${quotaNote ? `<p class="xd-small xd-quota-note">${quotaNote}</p>` : ''}
      ${r.description ? `<p class="xd-small">${esc(r.description)}</p>` : ''}
      ${r.notes ? `<p class="xd-small xd-note"><i class="fa-solid fa-circle-info"></i> ${esc(r.notes)}</p>` : ''}
      <button type="button" class="xd-link" onclick="identToggleEdit()"><i class="fa-solid fa-pen"></i> ${identEditOpen ? 'Cerrar' : '¿Algo no cuadra? Corregir datos'}</button>
      ${identEditOpen ? identEditHtml(r, m.country) : ''}
    </div>
    <div class="xd-actions">
      ${cand ? `<button type="button" class="xd-act xd-act-main" onclick="identOpenCoin('${jsArg(cand.coin.id)}')"><i class="fa-solid fa-folder-open"></i> Abrir ficha</button>` :
               `<button type="button" class="xd-act xd-act-main" onclick="identAddToCatalog()"><i class="fa-solid fa-plus"></i> Añadir al catálogo</button>`}
      <button type="button" class="xd-act" onclick="identOpenNumista()"><i class="fa-solid fa-magnifying-glass"></i> Numista</button>
      <button type="button" class="xd-act" onclick="identNewPhoto()"><i class="fa-solid fa-camera"></i> Otra moneda</button>
    </div>
  </div>`;
}
