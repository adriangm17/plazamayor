/* ===== VISTA ÁLBUM ===== */
let pressTimer = null;
let isLongPress = false;
let coinHoldSuppressClick = false;
// Tras una pulsación larga, el clic al soltar no debe tocar lo que haya debajo (p. ej. cerrar la ficha recién abierta)
window.addEventListener('click', e => {
  if (coinHoldSuppressClick) { e.stopPropagation(); e.preventDefault(); }
}, true);
// En móvil, mantener pulsado no debe abrir el menú del navegador sobre la imagen de la moneda
window.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.xc')) e.preventDefault(); });

let albumGroup = '';   // (sin uso desde 4.10: ya no hay pestañas ni grupos de períodos; se mantiene vacío por compatibilidad)

// Todos los períodos del país se ven siempre; el desplegable "Épocas" solo lleva a la posición de cada uno
function periodsInAlbumView() { return periodsOfCountry(currentCountryId); }
function periodProgressText(p) {
  const n = completionList(coinsOfPeriod(p.id)).filter(c => !isSilverCoin(c));
  return `${n.filter(c => c.acquired).length}/${n.length}`;
}
function validAlbumPeriod() { albumPeriodId = ''; albumGroup = ''; return ''; }

// Años (mín–máx) que cubren las monedas de un período; null si no tiene fechas
function periodYearSpan(p) {
  let min = Infinity, max = -Infinity;
  coinsOfPeriod(p.id).forEach(c => { const r = parseYearRange(c.range); if (r) { min = Math.min(min, r.min); max = Math.max(max, r.max); } });
  return min === Infinity ? null : { min, max };
}
// Períodos del país de la fecha más reciente a la más antigua; los que no tienen fechas, al final y en el orden de la página
function periodsByDate() {
  const all = periodsOfCountry(currentCountryId).map((p, i) => ({ p, i, span: periodYearSpan(p) }));
  const dated = all.filter(x => x.span).sort((a, b) => (b.span.min - a.span.min) || (b.span.max - a.span.max) || (a.i - b.i));
  return dated.concat(all.filter(x => !x.span));
}

function renderTabs() {
  if (!countryById(currentCountryId)) currentCountryId = null;
  const country = countryById(currentCountryId);
  // Sin país elegido se muestra la lista de países y se ocultan cabecera y filtros
  ['period-bar', 'album-filters'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = country ? '' : 'none';
  });
  validAlbumPeriod();
  if (typeof navSync === 'function') navSync();
  document.getElementById('album-country-title').innerHTML = country
    ? `<i class="fa-solid fa-chevron-left"></i>${flagChip(country, 66, 46)}<span>${esc(country.name)}</span>`
    : '';
  // v7.09: la burbuja de la cabecera tiene fondo sólido (morado del proyecto, definido en style.css)
  const bar = document.getElementById('period-bar');
  if (bar) bar.style.background = '';
  if (!country) { closePeriodsOverlay(); return; }
  document.getElementById('btn-periods-open').innerHTML = `<span>ÉPOCAS</span><i class="fa-solid fa-chevron-down"></i>`;
  if (!document.getElementById('periods-overlay').classList.contains('hidden')) renderPeriodsOverlay();
}

/* ----- Desplegable "Épocas": pantalla completa con los períodos por fecha ----- */
function renderPeriodsOverlay() {
  const country = countryById(currentCountryId);
  if (!country) return;
  const list = periodsByDate();
  document.getElementById('periods-ov-list').innerHTML = list.length === 0
    ? `<p class="xa-msg">Este país aún no tiene períodos.</p>`
    : list.map((x, i) => `
      <button type="button" class="xa-ovrow" onclick="goToPeriod('${jsArg(x.p.id)}')">
        <span class="xp-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="xa-ovname">${esc(periodDisplayName(x.p))}${/\d{4}/.test(periodDisplayName(x.p)) ? '' : `<small>${x.span ? (x.span.min === x.span.max ? x.span.min : x.span.min + ' – ' + x.span.max) : 'Sin fechas'}</small>`}</span>
        <span class="xa-pc">${periodProgressText(x.p)}</span>
      </button>`).join('');
}
function togglePeriodsOverlay() {
  const el = document.getElementById('periods-overlay');
  if (el && !el.classList.contains('hidden')) { closePeriodsOverlay(); return; }
  if (!countryById(currentCountryId)) return;
  renderPeriodsOverlay();
  el.classList.remove('hidden');
  document.getElementById('periods-ov-list').scrollTop = 0;
  document.getElementById('btn-periods-open').classList.add('xa-open');
}
function closePeriodsOverlay() {
  const el = document.getElementById('periods-overlay');
  if (el) el.classList.add('hidden');
  const b = document.getElementById('btn-periods-open');
  if (b) b.classList.remove('xa-open');
}
// Elegir una época: se cierra el desplegable, se abre su sección y se baja hasta ella
function goToPeriod(periodId) {
  const p = periodById(periodId);
  closePeriodsOverlay();
  if (!p) return;
  if (p.collapsed) { p.collapsed = false; persistMeta(); }
  if (coinsOfPeriod(p.id).length === 0) periodForceOpen[p.id] = true;
  movingCoinId = null;
  renderSections();
  setTimeout(() => {
    const el = document.getElementById('period-section-' + periodId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

/* ----- Buscador de país con texto predictivo (por inicial del nombre) ----- */
function alphaCountries() {
  return [...countries].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

function countrySuggestions(query) {
  const q = normKey(query.replace(/^\s+/, ''));
  return alphaCountries().filter(c => normKey(c.name).startsWith(q));
}

function onCountrySearchInput(value) {
  const box = document.getElementById('country-suggest');
  const list = countrySuggestions(value);
  const n = value.replace(/^\s+/, '').length;
  box.innerHTML = list.length === 0
    ? `<div class="xa-none">Ningún país empieza por "${esc(value.trim())}"</div>`
    : list.map(c => `
      <button onmousedown="event.preventDefault()" onclick="pickCountrySuggestion('${jsArg(c.id)}')" class="xa-sug ${c.id === currentCountryId ? 'xa-cur' : ''}">
        <span class="flex items-center gap-2">${flagChip(c, 20, 14)}<span><b>${esc(c.name.slice(0, n))}</b>${esc(c.name.slice(n))}</span></span>
      </button>`).join('');
  box.classList.remove('hidden');
}

function closeCountrySuggest() {
  const box = document.getElementById('country-suggest');
  if (box) box.classList.add('hidden');
}

function pickCountrySuggestion(countryId) {
  const input = document.getElementById('album-country-search');
  if (input) { input.value = ''; input.blur(); }
  closeCountrySuggest();
  selectCountry(countryId);
}

function onCountrySearchKey(e) {
  if (e.key === 'Escape') { closeCountrySuggest(); e.target.blur(); }
  else if (e.key === 'Enter') {
    const first = countrySuggestions(e.target.value)[0];
    if (first) pickCountrySuggestion(first.id);
  }
}

window.addEventListener('click', e => {
  const wrap = document.getElementById('country-search-wrap');
  if (wrap && !wrap.contains(e.target)) closeCountrySuggest();
});

function selectCountry(countryId) {
  resetAlbumFilters();
  currentCountryId = countryId;
  albumPeriodId = '';
  albumGroup = '';
  movingCoinId = null;
  render();
  window.scrollTo(0, 0);
}

// Un solo botón: si hay algún período abierto los contrae todos; si están todos contraídos, los despliega
function updateTogglePeriodsButton() {
  const btn = document.getElementById('btn-toggle-periods');
  if (!btn) return;
  const list = periodsOfCountry(currentCountryId);
  const anyOpen = list.some(p => !periodIsCollapsed(p));
  btn.title = btn.ariaLabel = anyOpen ? 'Contraer períodos' : 'Desplegar períodos';
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = `<i class="fa-solid fa-angles-${anyOpen ? 'up' : 'down'}"></i>`;
}
function toggleAllPeriods() {
  const list = periodsOfCountry(currentCountryId);
  if (list.some(p => !periodIsCollapsed(p))) collapseAllPeriods(); else expandAllPeriods();
}

function expandAllPeriods() {
  periodsOfCountry(currentCountryId).forEach(p => { p.collapsed = false; periodForceOpen[p.id] = true; });
  persistMeta();
  renderSections();
}

function collapseAllPeriods() {
  periodsOfCountry(currentCountryId).forEach(p => { p.collapsed = true; periodForceOpen[p.id] = false; });
  persistMeta();
  renderSections();
}

function toggleCollapse(periodId) {
  const p = periodById(periodId);
  if (!p) return;
  if (coinsOfPeriod(periodId).length === 0) periodForceOpen[periodId] = !periodForceOpen[periodId];
  else p.collapsed = !p.collapsed;
  persistMeta();
  renderSections();
}

// Gira a la vez todas las monedas visibles del período (si alguna está de cara, las pone todas del reverso; si no, todas de cara)
function flipPeriodCoins(periodId) {
  const inners = [...document.querySelectorAll('#period-section-' + CSS.escape(periodId) + ' .coin-inner')];
  if (!inners.length) return;
  const toBack = inners.some(el => !el.classList.contains('flipped'));
  inners.forEach(el => el.classList.toggle('flipped', toBack));
}

// Filtro "solo las que me faltan" de un período concreto (solo durante la sesión, no se guarda)
// Los períodos sin monedas salen contraídos por defecto; aquí se recuerdan (solo durante la sesión) los que se abren a propósito
const periodForceOpen = {};
function periodIsCollapsed(p) {
  return coinsOfPeriod(p.id).length === 0 ? !periodForceOpen[p.id] : !!p.collapsed;
}

const periodOnlyMissing = {};
function togglePeriodMissing(periodId) {
  periodOnlyMissing[periodId] = !periodOnlyMissing[periodId];
  renderSections();
}

function movePeriod(periodId, direction) {
  const list = periodsOfCountry(currentCountryId);
  const idx = list.findIndex(p => p.id === periodId);
  const target = idx + direction;
  if (idx < 0 || target < 0 || target >= list.length) return;
  list.forEach((p, i) => { p.order = i; });
  [list[idx].order, list[target].order] = [list[target].order, list[idx].order];
  persistMeta();
  render();
}

/* ----- Filtros ----- */
function isAlbumFilterActive() {
  return albumSearch.trim() !== '' || albumOnlyMissing || albumOnlyOwned || albumOnlySpecial;
}

function matchesAlbumFilter(c) {
  if (albumOnlyMissing && c.acquired) return false;
  if (albumOnlyOwned && !c.acquired) return false;
  if (albumOnlySpecial && coinType(c) === DEFAULT_COIN_TYPE) return false;
  const q = albumSearch.trim().toLowerCase();
  if (!q) return true;
  const p = periodById(c.periodId);
  const itemsText = (c.items || []).map(i => `${i.year} ${i.grade} ${i.notes}`).join(' ');
  const haystack = [c.denom, c.km, c.cecaMaterial, c.rarity, c.range, p ? p.name : '', itemsText]
    .map(v => String(v ?? '').toLowerCase()).join(' ');
  return q.split(/\s+/).every(word => haystack.includes(word));
}

// Botones-filtro del Álbum (solo icono): activo = ámbar
function setFilterButtonState(id, active) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.className = 'xp-btn' + (active ? ' xp-on' : '');
}

// Resetea todos los filtros del Álbum (búsqueda, faltantes, no circulantes y "faltantes" por período).
// No repinta: quien la llama se encarga de renderizar.
function resetAlbumFilters() {
  albumSearch = '';
  albumOnlyMissing = false;
  albumOnlyOwned = false;
  albumOnlySpecial = false;
  Object.keys(periodOnlyMissing).forEach(k => delete periodOnlyMissing[k]);
  setFilterButtonState('btn-only-missing', false);
  setFilterButtonState('btn-only-owned', false);
  setFilterButtonState('btn-only-special', false);
}

function toggleOnlyMissing() {
  albumOnlyMissing = !albumOnlyMissing;
  if (albumOnlyMissing) { albumOnlyOwned = false; setFilterButtonState('btn-only-owned', false); }   // excluyentes entre sí
  setFilterButtonState('btn-only-missing', albumOnlyMissing);
  renderSections();
}

function toggleOnlyOwned() {
  albumOnlyOwned = !albumOnlyOwned;
  if (albumOnlyOwned) { albumOnlyMissing = false; setFilterButtonState('btn-only-missing', false); }
  setFilterButtonState('btn-only-owned', albumOnlyOwned);
  renderSections();
}

function toggleOnlySpecial() {
  albumOnlySpecial = !albumOnlySpecial;
  setFilterButtonState('btn-only-special', albumOnlySpecial);
  renderSections();
}

/* ----- Interacción con monedas ----- */
function openCoinOrVariants(el, coinId) {   // ficha base de un grupo de variantes → ficha de variantes; el resto → su ficha
  if (el && el.dataset && el.dataset.vkey) openVariantsSheet(el.dataset.vkey, el.dataset.vok);
  else openCoinModal(coinId);
}
function handleCoinTouchStart(e, coinId) {
  isLongPress = false;
  const cardEl = e && e.currentTarget;
  pressTimer = setTimeout(() => {
    // Pulsación larga: solo despliega la ficha (mover la moneda se hace desde "Editar ficha")
    isLongPress = true;
    coinHoldSuppressClick = true;
    setTimeout(() => { coinHoldSuppressClick = false; }, 600);
    if (navigator.vibrate) { try { navigator.vibrate(18); } catch (err) {} }
    openCoinOrVariants(cardEl, coinId);
  }, 500);
}

function handleCoinTouchEnd(e, coinId) {
  clearTimeout(pressTimer);
  if (isLongPress) setTimeout(() => { isLongPress = false; }, 400);
}
function handleCoinTouchMove(e) { clearTimeout(pressTimer); }

function handleCoinClick(e, coinId) {
  if (isLongPress) {
    e.stopPropagation();
    isLongPress = false;
    return;
  }
  openCoinOrVariants(e.currentTarget, coinId);
}

function flipGridCoin(event, coinId) {
  event.stopPropagation();
  // Se busca dentro de la propia tarjeta: el mismo id puede existir también en la página de estado de Estadísticas (oculta)
  const host = event.currentTarget && event.currentTarget.querySelector ? event.currentTarget : null;
  const inner = (host && host.querySelector('.coin-inner')) || document.getElementById(`grid-coin-inner-${coinId}`);
  if (inner) inner.classList.toggle('flipped');
}

function moveCoin(coinId, direction) {
  const coin = coins.find(c => c.id === coinId);
  if (!coin) return;
  const same = coinsOfPeriod(coin.periodId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const localIndex = same.findIndex(c => c.id === coinId);
  const target = localIndex + direction;
  if (target < 0 || target >= same.length) return;

  const tmp = same[localIndex].order;
  same[localIndex].order = same[target].order;
  same[target].order = tmp;
  same.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  same.forEach((c, idx) => { c.order = idx; });
  saveCoins(same);
}

/* ----- Pintado ----- */
// Lista de países en burbujas (bandera + nombre) para elegir uno cuando aún no hay ninguno seleccionado
function renderCountryPicker(container) {
  const list = alphaCountries();
  if (!list.length) { container.innerHTML = `<div class="xp-empty-msg">Aún no hay países en la colección.</div>`; return; }
  container.innerHTML = `
    <span class="xs-kicker block">Álbum</span>
    <h2 class="xs-h1" style="font-size:30px">Elige un país</h2>
    <div class="xa-bubbles">${list.map(c => `
      <button type="button" class="xa-bubble" onclick="selectCountry('${jsArg(c.id)}')">${flagChip(c, 24, 17)}<span>${esc(prettyName(c.name))}</span></button>`).join('')}
    </div>`;
}

function renderSections() {
  const container = document.getElementById('album-sections');
  if (!countryById(currentCountryId)) { renderCountryPicker(container); return; }
  const filtered = coinsOfCountry(currentCountryId);

  if (periodsOfCountry(currentCountryId).length === 0) {
    container.innerHTML = `<div class="xp-empty-msg">Este país aún no tiene períodos. Usa el botón + de arriba para añadir uno.</div>`;
    return;
  }

  const filterActive = isAlbumFilterActive();

  validAlbumPeriod();
  let secNum = 0;
  const sectionsHtml = periodsInAlbumView().map(p => {
    const allPeriodCoins = filtered.filter(c => c.periodId === p.id);
    const onlyMissingHere = !!periodOnlyMissing[p.id];
    const periodCoins = allPeriodCoins.filter(c => matchesAlbumFilter(c) && !(onlyMissingHere && c.acquired)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (filterActive && periodCoins.length === 0 && !onlyMissingHere) return '';

    const cmpCoins = completionList(allPeriodCoins);   // v7.08: las variantes no cuentan (cada grupo = 1 moneda)
    const normalCoins = cmpCoins.filter(c => !isSilverCoin(c));
    const acquiredCount = normalCoins.filter(c => c.acquired).length;
    const totalCount = normalCoins.length;
    const normalPct = totalCount > 0 ? Math.round((acquiredCount / totalCount) * 100) : 0;
    const silverCoins = cmpCoins.filter(isSilverCoin);
    const silverPct = silverCoins.length > 0 ? Math.round((silverCoins.filter(c => c.acquired).length / silverCoins.length) * 100) : 0;

    const isCollapsed = periodIsCollapsed(p);
    const pid = esc(p.id);
    const num = String(++secNum).padStart(2, '0');
    const ptp = periodTitleParts(p);

    return `
      <section id="period-section-${pid}" class="xa-sec">
        <div class="xp-head xa-head" onclick="toggleCollapse('${pid}')" role="button" aria-expanded="${!isCollapsed}">
          <span class="xp-num">${num}</span>
          <span class="xa-ptitle">
            <span class="xp-title xa-pname" title="${esc(periodDisplayName(p))}">${esc(ptp.name)}</span>
            ${ptp.date ? `<span class="xa-pdate">${esc(ptp.date)}</span>` : ''}
          </span>
          <span class="xa-tools" onclick="event.stopPropagation()">
            <button onclick="flipPeriodCoins('${pid}')" class="xp-btn" title="Girar todas las monedas del período" aria-label="Girar todas las monedas del período"><i class="fa-solid fa-rotate"></i></button>
            <button onclick="togglePeriodMissing('${pid}')" class="xp-btn ${onlyMissingHere ? 'xp-on' : ''}" title="Ver solo las que me faltan de este período" aria-label="Ver solo las que me faltan de este período"><i class="fa-solid fa-circle-exclamation"></i></button>
          </span>
        </div>
        <div class="xa-prog">
          <span class="xa-count">${acquiredCount}/${totalCount} · <b>${normalPct}%</b></span>
          ${indiceBars(normalPct, silverPct, silverCoins.length > 0)}
        </div>

        <div class="xa-grid ${isCollapsed ? 'hidden' : ''}">
          ${(isCollapsed ? [] : buildAlbumCards(periodCoins)).map(x => renderCoinCard(x.coin, { group: x.group, ok: x.ok, base: x.base })).join('')}
          ${(!isCollapsed && periodCoins.length === 0) ? `<p class="xa-msg">${allPeriodCoins.length === 0 ? 'Este período aún no tiene monedas. Usa el + para añadir la primera.' : 'No hay monedas que mostrar con este filtro.'}</p>` : ''}
        </div>
      </section>
    `;
  }).join('');

  container.innerHTML = sectionsHtml.trim() !== ''
    ? sectionsHtml
    : `<div class="xp-empty-msg">Ninguna moneda coincide con el filtro.</div>`;
  hydrateImages(container);
  fitCardYears(container);
  updateTogglePeriodsButton();
  if (typeof navSync === 'function') navSync();
}

/* ----- Variantes de una misma moneda (KM# 12, 12a, 12.1, 12.2…) -----
   Se agrupan por país + número base del catálogo. Una ficha con 2 o más del mismo grupo lleva un círculo
   dividido en tantas porciones como variantes (la original también cuenta); cada una conseguida se pinta de verde y cada hueco (las que faltan) en rojo, en todas las fichas del grupo. */
let variantCache = null;   // se reconstruye en cada pintado (se vacía al terminar la tarea actual)
function kmKey(km) {
  const m = String(km ?? '').match(/^\s*([A-Za-zÀ-ÿ]*)\s*[#.]?\s*(\d+)(.*)$/);
  if (!m) return null;
  return { base: (m[1] || 'KM').toUpperCase() + '#' + m[2], suffix: m[3].trim().toLowerCase().replace(/^[\s.\-_/]+/, '') };
}
function variantGroupOf(c) {
  const k = kmKey(c && c.km);
  if (!k) return null;
  if (!variantCache) {
    variantCache = new Map();
    coins.forEach(x => {
      const kx = kmKey(x.km); if (!kx) return;
      const key = x.countryId + '|' + kx.base;
      if (!variantCache.has(key)) variantCache.set(key, []);
      variantCache.get(key).push({ coin: x, suffix: kx.suffix });
    });
    variantCache.forEach(g => g.sort((a, b) => a.suffix.localeCompare(b.suffix, undefined, { numeric: true })));   // la original (sin sufijo) primero
    Promise.resolve().then(() => { variantCache = null; });
  }
  const g = variantCache.get(c.countryId + '|' + k.base);
  return g && g.length > 1 ? g.map(e => e.coin) : null;
}
/* ----- v4.33: una sola ficha por grupo de variantes (mismo país + período + número base de KM) -----
   El álbum pinta la variante elegida (por defecto la original, sin sufijo) y el círculo partido hace de selector.
   Cada variante sigue siendo una moneda independiente (conseguida, ejemplares, grado, plata, imágenes, backups). */
function compactGroupKey(c) {
  const k = kmKey(c && c.km);
  return k ? c.periodId + '|' + c.countryId + '|' + k.base : null;
}
function compactGroupsMap() {   // clave → variantes (2 o más) del mismo período, la original primero
  const m = new Map();
  coins.forEach(x => {
    const key = compactGroupKey(x); if (!key) return;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push({ coin: x, suffix: kmKey(x.km).suffix });
  });
  const out = new Map();
  m.forEach((g, key) => {
    if (g.length < 2) return;
    g.sort((a, b) => a.suffix.localeCompare(b.suffix, undefined, { numeric: true }));
    out.set(key, g.map(e => e.coin));
  });
  return out;
}
/* v7.08: porcentajes de compleción. Cada grupo de variantes (mismo país + período + KM# base) cuenta como UNA moneda:
   la ficha base, que se da por conseguida si se tiene alguna de sus variantes (igual que se ve en el álbum). */
let _cmpCache = null;
function completionList(list) {
  if (!_cmpCache || _cmpCache.ref !== coins || _cmpCache.n !== coins.length) {
    _cmpCache = { ref: coins, n: coins.length, map: compactGroupsMap() };
    Promise.resolve().then(() => { _cmpCache = null; });
  }
  const out = [];
  list.forEach(c => {
    const key = compactGroupKey(c), g = key && _cmpCache.map.get(key);
    if (!g) { out.push(c); return; }
    if (c.id !== g[0].id) return;   // las variantes (no base) no cuentan
    const any = g.some(x => x.acquired);
    out.push(!!c.acquired === any ? c : Object.assign({}, c, { acquired: any }));
  });
  return out;
}

// De la lista de monedas visibles de un período devuelve una ficha por grupo (en la posición de su primera variante).
// Solo se ve la ficha BASE del grupo.
function buildAlbumCards(list) {
  const groups = compactGroupsMap(), visibleIds = new Set(list.map(c => c.id)), seen = new Set(), out = [];
  list.forEach(c => {
    const key = compactGroupKey(c), g = key && groups.get(key);
    if (!g) { out.push({ coin: c, group: null }); return; }
    if (seen.has(key)) return;
    seen.add(key);
    const ok = g.filter(x => visibleIds.has(x.id)).map(x => x.id);   // las que no pasan el filtro no se pueden elegir
    out.push({ coin: g[0], group: g, ok, base: true });   // v4.47: solo existe la ficha base; las variantes se abren desde su desplegable
  });
  return out;
}

// Años de la ficha base: del primer año al último de todas las monedas del grupo
function unionRange(g) {
  let lo = Infinity, hi = -Infinity, act = false;
  g.forEach(x => {
    const str = String(x.range || ''), m = str.match(/\d{4}/g);
    if (!m) return;
    m.forEach(y => { lo = Math.min(lo, +y); hi = Math.max(hi, +y); });
    if (/ACT/i.test(str)) act = true;
  });
  if (lo === Infinity) return formatYearRange(g[0].range);
  if (act) hi = Math.max(hi, new Date().getFullYear());
  return formatYearRange(lo === hi ? String(lo) : `${lo}-${hi}`);
}
// Ficha base: las rarezas distintas del grupo cada una con su color y su letra, repartidas por igual en la casilla
function groupRarityHtml(g) {
  const set = [...new Set(g.map(x => String(x.rarity || '').trim().toUpperCase()).filter(Boolean))];   // en el orden de KM del grupo
  if (!set.length) return `<div class="xc-cell xc-rar w-[45%]" style="background:rgba(var(--xp-sand-rgb),.16);color:var(--xp-sand);">-</div>`;
  const fs = set.length <= 1 ? 12 : set.length === 2 ? 11 : set.length === 3 ? 10 : 8.5;
  return `<div class="xc-cell xc-rar xc-rar-split w-[45%]" title="Rarezas: ${esc(set.join(', '))}" style="font-size:${fs}px">${set.map(r => `<span style="${getRarityStyle(r)}">${r === 'PLATA' ? 'AG' : esc(r)}</span>`).join('')}</div>`;
}
function baseKmLabel(c) {   // KM# del que parten las variantes (sin sufijo): KM# 26.1 → KM# 26
  const k = kmKey(c && c.km);
  return k ? k.base.replace('#', '# ') : (c && c.km) || 'KM#-';
}

function variantMarkHtml(c) {
  const g = variantGroupOf(c);   // todas las variantes del país con ese número base (también las de otros períodos)
  if (!g) return '';
  const n = g.length, f = v => v.toFixed(2);
  // Las porciones van en sentido antihorario desde arriba: la 1.ª variante a la izquierda, la 2.ª a la derecha…
  const pt = i => { const a = -Math.PI / 2 - 2 * Math.PI * i / n; return [12 + 12 * Math.cos(a), 12 + 12 * Math.sin(a)]; };
  let fills = '', gaps = '', got = 0;
  g.forEach((x, i) => {
    const [x1, y1] = pt(i), [x2, y2] = pt(i + 1);
    // Conseguida → verde; las que faltan → rojo (igual en todas las fichas del grupo)
    if (x.acquired) got++;
    fills += n === 1 ? '' : `<path d="M12 12L${f(x1)} ${f(y1)}A12 12 0 0 0 ${f(x2)} ${f(y2)}Z" style="fill:${x.acquired ? 'var(--xp-have)' : 'var(--xp-miss)'}"/>`;
    gaps += `M12 12L${f(x1)} ${f(y1)}`;
  });
  // Círculo plano sin contorno: las porciones se separan con un hueco del color de la ficha
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">` +
    `${fills}<path d="${gaps}" fill="none" stroke="var(--xp-plum)" stroke-width="1.4"/></svg>`;
  return `<span class="xc-var" title="Variantes: ${got} de ${n} conseguidas">${svg}</span>`;
}

// Número romano de una variante (lo usa la ficha de variantes)
function toRoman(n) {
  const t = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let r = ''; t.forEach(([v, l]) => { while (n >= v) { r += l; n -= v; } }); return r;
}

function renderCoinCard(c, opts) {
  opts = (opts && typeof opts === 'object') ? opts : {};   // (.map le pasa el índice como 2.º argumento)
  // Ficha BASE de un grupo de variantes: imagen y KM# de la original; verde si se tiene al menos una variante; años y rarezas del grupo entero
  const isBase = !!(opts.base && opts.group);
  if (isBase) {
    const first = opts.group[0];
    c = Object.assign({}, first, { acquired: opts.group.some(x => x.acquired), items: opts.group.flatMap(x => Array.isArray(x.items) ? x.items : []) });
  }
  let baseStyleClass = 'coin-base-style';
  const mat = (c.cecaMaterial || '').toLowerCase();
  if (mat.includes('oro')) baseStyleClass = 'coin-oro-style';
  if (mat.includes('cobre') || mat.includes('bronce')) baseStyleClass = 'coin-cobre-style';

  const isPlata = isSilverCoin(c);
  const hasCeca = c.cecaMaterial && c.cecaMaterial.trim() !== '';
  const cardBorderClass = (c.acquired
      ? ({ F: 'border-[#a3b84a] shadow-[0_0_10px_rgba(163,184,74,0.28)]',      // F: verde pálido amarillento
           TBD: 'xc-brd-tbd' }[bestGrade(c)]   // v7.08: TBD, borde #e8e240 (clase propia en style.css)
         || 'border-[color:var(--xp-have)] shadow-[0_0_10px_rgba(var(--xp-have-rgb),0.25)]')
      : (isPlata ? 'xc-brd-silver' : 'xc-miss-brd'));   // las que faltan: #ff5757 (v7.01); las de rareza PLATA que faltan: #8f9cbc (v7.08)

  // La ceca/variante siempre es libre; en las de plata, el valor calculado ocupa la casilla de rareza (mismo color de la etiqueta PLATA)
  const cecaOrValue = hasCeca ? esc(c.cecaMaterial) : '—';
  const rarityHtml = isPlata ? `<span class="xc-price">${computeCoinSilverValue(c) || '0,00 €'}</span>` : esc(c.rarity || '-');

  const id = esc(c.id);
  const denom = esc(c.denom);
  // Esquina superior derecha: tipo (círculo; FAO lleva la palabra). Los circulantes no llevan marca.
  const type = coinType(c), typeColor = COIN_TYPE_COLORS[type];
  const typeDot = type === DEFAULT_COIN_TYPE ? '' :
    type === 'FAO' ? `<span class="xc-fao" title="FAO">FAO</span>` :
    `<span class="xc-tdot" style="background:${typeColor};border:2px solid ${typeColor}" title="${esc(type)}"></span>`;
  // Esquina superior izquierda: iconos de formato (solo los distintos del formato por defecto, de los ejemplares que se tienen)
  const ownedFormats = [...new Set((c.items || []).filter(i => i && String(i.grade || '').trim() !== '').map(i => i.format).filter(f => f && f !== DEFAULT_ITEM_FORMAT && ITEM_FORMATS.some(x => x.id === f)))];
  const topLeft = ownedFormats.length === 0 ? '' :
    `<span class="xc-tl" style="color:var(--xp-sand)" title="${esc(ownedFormats.map(f => ITEM_FORMATS.find(x => x.id === f).label).join(', '))}">${ownedFormats.map(f => itemFormatIcon(f, 15)).join('')}</span>`;

  // Estado de conservación en la esquina inferior izquierda, justo encima de la denominación (mejor grado de los ejemplares)
  const grade = bestGrade(c);
  const gradeMark = !grade ? '' :
    `<span class="xc-grade xc-g-${grade}" title="Conservación: ${esc(grade)}">${esc(grade)}</span>`;

  return `
    <div
      id="coin-card-${id}"
      ${opts.plain ? `onclick="openCoinModal('${id}')"` : `onmousedown="handleCoinTouchStart(event, '${id}')"
      onmouseup="handleCoinTouchEnd(event, '${id}')"
      onmouseleave="handleCoinTouchEnd(event, '${id}')"
      ontouchstart="handleCoinTouchStart(event, '${id}')"
      ontouchend="handleCoinTouchEnd(event, '${id}')"
      ontouchmove="handleCoinTouchMove(event)"
      onclick="handleCoinClick(event, '${id}')"`}
      ${isBase ? `data-vkey="${esc(compactGroupKey(c))}" data-vok="${(opts.ok || []).map(esc).join(',')}"` : ''}
      class="xc ${cardBorderClass}${c.acquired ? ' xc-own' : ''}">

      ${typeDot}
      ${topLeft}

      ${opts.extra || ''}

      <div class="relative w-full flex justify-center">
      ${gradeMark}
      ${linkWarnHtml(c, opts)}
      ${variantMarkHtml(c)}
      <div class="w-28 h-28 sm:w-32 sm:h-32 my-0.5 coin-perspective" onclick="flipGridCoin(event, '${id}')">
        <div id="grid-coin-inner-${id}" class="coin-inner">
          <div class="coin-front ${!c.hasFront ? baseStyleClass : 'has-img'} ${!c.acquired ? 'coin-missing' : ''} ${!c.hasFront ? 'shadow-md' : ''}">
            ${c.hasFront ? imgTag(c.id, 'front') : `<span class="text-2xl font-black font-serif-numis tracking-tight">${denom}</span>`}
          </div>
          <div class="coin-back ${!c.hasBack ? baseStyleClass : 'has-img'} ${!c.acquired ? 'coin-missing' : ''} ${!c.hasBack ? 'shadow-md' : ''}">
            ${c.hasBack ? imgTag(c.id, 'back') : `<span class="text-2xl font-black font-serif-numis tracking-tight">${denom}</span>`}
          </div>
        </div>
      </div>
      </div>

      <div class="w-full mt-2 space-y-1.5">
        <div class="xc-denom">
          ${denom}
        </div>

        <div class="flex gap-1 w-full">
          <div class="xc-cell xc-soft xc-yr w-[55%]">
            ${esc(isBase ? unionRange(opts.group) : formatYearRange(c.range))}
          </div>
          ${isBase
            ? groupRarityHtml(opts.group)
            : `<div class="xc-cell xc-rar w-[45%]" style="${c.rarity ? getRarityStyle(c.rarity) : 'background:rgba(var(--xp-sand-rgb),.16);color:var(--xp-sand);'}">${rarityHtml}</div>`}
        </div>

        <div class="flex gap-1 w-full">
          <div class="xc-cell xc-km w-[45%]">
            ${esc(isBase ? baseKmLabel(c) : (c.km || 'KM#-'))}
          </div>
          ${isBase
            ? `<div class="xc-cell xc-multi w-[55%]" title="${opts.group.length} variantes · toca la ficha para verlas"><i class="fa-solid fa-layer-group"></i><span>${opts.group.length} VARIANTES</span></div>`
            : `<div class="xc-cell xc-soft w-[55%]" style="font-weight:600;font-size:11px">${cecaOrValue}</div>`}
        </div>
      </div>
    </div>
  `;
}


/* ===== Ficha desplegable de variantes (se abre al pulsar una ficha BASE) =====
   Una fila por variante: número romano en la esquina (rojo = me falta, verde = la tengo), moneda, KM# + años,
   ceca/material, rareza · precio de la plata · conservación y botones a Numista / Ucoin. Pulsar la fila abre la ficha completa. */
let variantsSheetKey = null;
function openVariantsSheet(key, okStr) {
  const g = compactGroupsMap().get(key); if (!g) return;
  variantsSheetKey = key;
  const ok = new Set(String(okStr || '').split(',').filter(Boolean));
  const first = g[0];
  document.getElementById('variants-title').textContent = first.denom;
  document.getElementById('variants-subtitle').textContent = [coinCountryName(first), coinPeriodName(first), unionRange(g)].filter(Boolean).join(' · ').toUpperCase();
  const lk = (url, letter, name) => url
    ? `<button type="button" class="xp-lk" title="${name}" aria-label="${name}" onclick="event.stopPropagation();openCoinLink('${jsArg(url)}','${name}')">${letter}</button>`
    : `<span class="xp-lk xp-lk-off" title="${name}: sin enlace">${letter}</span>`;
  document.getElementById('variants-list').innerHTML = g.map((x, i) => {
    const off = ok.size && !ok.has(x.id) ? ' xv-off' : '';
    const grade = bestGrade(x), ceca = x.cecaMaterial && x.cecaMaterial.trim();
    const silver = isSilverCoin(x), price = silver ? computeCoinSilverValue(x) : '';
    const rar = silver ? 'AG' : String(x.rarity || '').toUpperCase();
    return `<div class="xv-row ${x.acquired ? 'xv-own' : 'xv-miss'}${off}" role="button" onclick="openVariantFromSheet('${jsArg(x.id)}')">
      <span class="xv-tab">${toRoman(i + 1)}</span>
      <span class="xv-thumb">${x.hasFront ? imgTag(x.id, 'front') : `<em>${esc(x.denom)}</em>`}</span>
      <span class="xv-rule"></span>
      <div class="xv-mid">
        <div class="xv-r1"><span class="xv-km">${esc(x.km || 'KM#-')}</span><span class="xv-yr">${esc(formatYearRange(x.range))}</span></div>
        <div class="xv-ceca">${ceca ? esc(ceca) : '—'}</div>
        <div class="xv-r3">
          ${rar ? `<span class="xv-rar" style="${silver ? getRarityStyle('PLATA') : getRarityStyle(rar)}">${esc(rar)}</span>` : ''}
          ${silver ? `<span class="xv-price">${esc(price || '0,00 €')}</span>` : ''}
          ${grade ? `<span class="xv-grade">${esc(grade)}</span>` : ''}
        </div>
      </div>
      <span class="xv-rule"></span>
      <div class="xv-links">${lk(x.numistaUrl, 'N', 'Numista')}${lk(x.ucoinUrl, 'U', 'Ucoin')}</div>
    </div>`;
  }).join('');
  const ov = document.getElementById('variants-modal');
  ov.classList.remove('hidden');
  hydrateImages(ov);
  fitVariantsSheet();
}
function closeVariantsSheet() { document.getElementById('variants-modal').classList.add('hidden'); }
function openVariantFromSheet(id) { closeVariantsSheet(); openCoinModal(id); }
// Añadir una variante nueva: abre el formulario de crear ficha con país, período, denominación y KM# base ya rellenos
function addVariantFromSheet() {
  const g = compactGroupsMap().get(variantsSheetKey); if (!g) return;
  const first = g[0];
  closeVariantsSheet();
  openCreateModal(first.periodId);
  document.getElementById('new-denom').value = first.denom || '';
  const km = document.getElementById('new-km');
  km.value = baseKmLabel(first);
  setTimeout(() => { try { km.focus(); km.setSelectionRange(km.value.length, km.value.length); } catch (e) {} }, 60);
}


/* v7.11: los años de la ficha usan el mayor tamaño de letra que cabe en su casilla (se reduce solo si no entra) */
function fitCardYears(root) {
  (root || document).querySelectorAll('.xc-yr').forEach(el => {
    if (!el.clientWidth) return;   // período contraído: se ajusta al desplegarlo
    let fs = 14.5;
    el.style.fontSize = fs + 'px';
    while (el.scrollWidth > el.clientWidth && fs > 9) { fs -= 0.5; el.style.fontSize = fs + 'px'; }
  });
}
window.addEventListener('resize', () => { const c = document.getElementById('album-sections'); if (c) fitCardYears(c); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const c = document.getElementById('album-sections'); if (c) fitCardYears(c); });


/* v7.13: enlaces. Numista solo acepta numista.com y Ucoin solo ucoin.net; si falta alguno o no es válido, la ficha lleva un «!» */
function linkHostOk(url, domain) {
  try { const u = new URL(String(url).trim()); return /^https?:$/.test(u.protocol) && (u.hostname === domain || u.hostname.endsWith('.' + domain)); } catch (e) { return false; }
}
function numistaUrlOk(url) { return linkHostOk(url, 'numista.com'); }
function ucoinUrlOk(url) { return linkHostOk(url, 'ucoin.net'); }
function coinLinkProblems(c) {
  const out = [];
  if (!c) return out;
  const n = String(c.numistaUrl || '').trim(), u = String(c.ucoinUrl || '').trim();
  if (!n) out.push('Falta el enlace a Numista'); else if (!numistaUrlOk(n)) out.push('El enlace de Numista no es de numista.com');
  if (!u) out.push('Falta el enlace a Ucoin'); else if (!ucoinUrlOk(u)) out.push('El enlace de Ucoin no es de ucoin.net');
  return out;
}
function linkWarnHtml(c, opts) {
  const list = (opts && opts.group && opts.group.length > 1) ? opts.group : [c];
  const probs = [...new Set(list.flatMap(coinLinkProblems))];
  if (!probs.length) return '';
  return `<span class="xc-warn" title="${esc(probs.join(' · '))}"><i class="fa-solid fa-exclamation"></i></span>`;
}
