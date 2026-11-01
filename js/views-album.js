/* ===== VISTA ÁLBUM ===== */
let pressTimer = null;
let isLongPress = false;

let albumGroup = '';   // grupo de períodos elegido ("1er Boliviano · …" → "1er boliviano"); '' = ninguno

/* ----- Agrupar períodos por el texto anterior a " · " (solo si hay 2 o más con el mismo prefijo) ----- */
function periodGroupParts(p) {
  const n = periodDisplayName(p);
  const i = n.indexOf(' · ');
  return i > 0 ? { key: normKey(n.slice(0, i)), label: n.slice(0, i).trim(), sub: n.slice(i + 3).trim() } : null;
}
function periodGroupList() {
  const ps = periodsOfCountry(currentCountryId);
  const count = {};
  ps.forEach(p => { const g = periodGroupParts(p); if (g) count[g.key] = (count[g.key] || 0) + 1; });
  const items = [], seen = {};
  ps.forEach(p => {
    const g = periodGroupParts(p);
    if (g && count[g.key] >= 2) {
      if (!seen[g.key]) { seen[g.key] = { group: true, key: g.key, label: g.label, periods: [] }; items.push(seen[g.key]); }
      seen[g.key].periods.push({ p, sub: g.sub });
    } else items.push({ group: false, p });
  });
  return items;
}
function groupKeyOfPeriod(p) {
  const g = p && periodGroupParts(p);
  return g && periodGroupList().some(it => it.group && it.key === g.key) ? g.key : '';
}
function periodsInAlbumView() {
  const all = periodsOfCountry(currentCountryId);
  if (albumPeriodId) return all.filter(p => p.id === albumPeriodId);
  if (albumGroup) return all.filter(p => { const g = periodGroupParts(p); return g && g.key === albumGroup; });
  return all;
}
function periodProgressText(p) {
  const n = coinsOfPeriod(p.id).filter(c => !isSilverCoin(c));
  return `${n.filter(c => c.acquired).length}/${n.length}`;
}

function validAlbumPeriod() {
  if (albumPeriodId && !periodsOfCountry(currentCountryId).some(p => p.id === albumPeriodId)) albumPeriodId = '';
  if (albumPeriodId) albumGroup = groupKeyOfPeriod(periodById(albumPeriodId));
  if (albumGroup && !periodGroupList().some(it => it.group && it.key === albumGroup)) albumGroup = '';
  return albumPeriodId;
}

function renderTabs() {
  if (!countryById(currentCountryId)) currentCountryId = null;
  const country = countryById(currentCountryId);
  // Sin país elegido se muestra la lista de países y se ocultan cabecera y filtros
  ['album-country-title', 'period-bar', 'album-filters'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = country ? '' : 'none';
  });
  validAlbumPeriod();
  document.getElementById('album-country-title').innerHTML = country
    ? `<i class="fa-solid fa-chevron-left"></i>${flagChip(country, 34, 24)}<span>${esc(country.name)}</span>`
    : '';
  const bar = document.getElementById('period-bar');
  if (bar && country) bar.style.background = `linear-gradient(90deg,rgba(61,26,84,.97) 0%,rgba(61,26,84,.88) 60%,rgba(61,26,84,.7) 100%),${flagLayers(country)}`;
  if (!country) return;
  const tabs = document.getElementById('period-tabs');
  const oldScroll = tabs.querySelector('.xa-scroll');
  const keepLeft = oldScroll ? oldScroll.scrollLeft : 0;
  const pill = (active) => `xa-pill ${active ? 'xa-on' : ''}`;
  const pc = (txt) => `<span class="xa-pc">${esc(txt)}</span>`;
  const items = periodGroupList();
  const chips = items.map(it => it.group
    ? `<button onclick="selectGroupTab('${jsArg(it.key)}')" class="${pill(albumGroup === it.key)} xa-pgroup" data-active="${albumGroup === it.key ? 1 : ''}">${esc(it.label)}${pc(it.periods.length + ' ▾')}</button>`
    : `<button onclick="selectPeriodTab('${jsArg(it.p.id)}')" class="${pill(it.p.id === albumPeriodId)}" data-active="${it.p.id === albumPeriodId ? 1 : ''}">${esc(periodDisplayName(it.p))}${pc(periodProgressText(it.p))}</button>`
  ).join('');
  const grp = albumGroup ? items.find(it => it.group && it.key === albumGroup) : null;
  const subRow = grp
    ? `<div class="xa-subrow"><button onclick="selectGroupTab('${jsArg(grp.key)}', true)" class="${pill(!albumPeriodId)} xa-sub">Todo ${esc(grp.label)}</button>` +
      grp.periods.map(x => `<button onclick="selectPeriodTab('${jsArg(x.p.id)}')" class="${pill(x.p.id === albumPeriodId)} xa-sub">${esc(x.sub)}${pc(periodProgressText(x.p))}</button>`).join('') + `</div>`
    : '';
  tabs.innerHTML =
    `<div class="xa-tabrow">` +
      `<button onclick="selectPeriodTab('')" class="${pill(!albumPeriodId && !albumGroup)}">Todas</button>` +
      `<div class="xa-scroll">${chips}</div>` +
      `<button onclick="openAddPeriodModal('${jsArg(currentCountryId)}')" class="xa-pill xa-plus" title="Añadir período" aria-label="Añadir período"><i class="fa-solid fa-plus"></i></button>` +
    `</div>` + subRow;
  const sc = tabs.querySelector('.xa-scroll');
  sc.scrollLeft = keepLeft;
  const act = sc.querySelector('[data-active="1"]');
  if (act && (act.offsetLeft < sc.scrollLeft || act.offsetLeft + act.offsetWidth > sc.scrollLeft + sc.clientWidth))
    sc.scrollLeft = act.offsetLeft - 8;
}

function selectPeriodTab(periodId) {
  if (periodId !== albumPeriodId) resetAlbumFilters();
  albumPeriodId = periodId;
  const p = periodById(periodId);
  albumGroup = p ? groupKeyOfPeriod(p) : '';
  if (p && p.collapsed) { p.collapsed = false; persistMeta(); }
  if (p && coinsOfPeriod(p.id).length === 0) periodForceOpen[p.id] = true;   // elegido a propósito: se abre
  movingCoinId = null;
  renderSections();
  renderTabs();
}

// Elegir un grupo de períodos (volver a tocarlo lo quita, salvo desde "Todo el grupo")
function selectGroupTab(key, force) {
  if (!force && albumGroup === key && !albumPeriodId) { selectPeriodTab(''); return; }
  resetAlbumFilters();
  albumGroup = key;
  albumPeriodId = '';
  periodsInAlbumView().forEach(p => { p.collapsed = false; });
  persistMeta();
  movingCoinId = null;
  renderSections();
  renderTabs();
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
  // Con varias épocas a la vista funciona como acordeón: al abrir una se pliegan las demás
  const opened = coinsOfPeriod(periodId).length === 0 ? !!periodForceOpen[periodId] : !p.collapsed;
  const view = periodsInAlbumView();
  if (opened && view.length > 1) view.forEach(q => {
    if (q.id === periodId) return;
    if (coinsOfPeriod(q.id).length === 0) periodForceOpen[q.id] = false; else q.collapsed = true;
  });
  persistMeta();
  renderSections();
  if (opened && view.length > 1) {
    const el = document.getElementById('period-section-' + periodId);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
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
  if (periodOnlyMissing[periodId]) periodOnlyOwned[periodId] = false;   // "faltan" y "tengo" son excluyentes
  renderSections();
}

// Filtro "solo las que tengo" de un período concreto (también solo durante la sesión)
const periodOnlyOwned = {};
function togglePeriodOwned(periodId) {
  periodOnlyOwned[periodId] = !periodOnlyOwned[periodId];
  if (periodOnlyOwned[periodId]) periodOnlyMissing[periodId] = false;
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

function onAlbumSearchInput(value) {
  albumSearch = value;
  renderSections();
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
  Object.keys(periodOnlyOwned).forEach(k => delete periodOnlyOwned[k]);
  const input = document.getElementById('album-search');
  if (input) input.value = '';
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
function handleCoinTouchStart(e, coinId) {
  isLongPress = false;
  pressTimer = setTimeout(() => {
    isLongPress = true;
    setMovingCoin(coinId);
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
  if (movingCoinId === coinId) return;
  openCoinModal(coinId);
}

function setMovingCoin(coinId) {
  movingCoinId = (movingCoinId === coinId) ? null : coinId;
  renderSections();
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
    const onlyOwnedHere = !!periodOnlyOwned[p.id];
    const periodCoins = allPeriodCoins.filter(c => matchesAlbumFilter(c) && !(onlyMissingHere && c.acquired) && !(onlyOwnedHere && !c.acquired)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (filterActive && periodCoins.length === 0 && !onlyMissingHere && !onlyOwnedHere) return '';

    const normalCoins = allPeriodCoins.filter(c => !isSilverCoin(c));
    const acquiredCount = normalCoins.filter(c => c.acquired).length;
    const totalCount = normalCoins.length;
    const normalPct = totalCount > 0 ? Math.round((acquiredCount / totalCount) * 100) : 0;
    const silverCoins = allPeriodCoins.filter(isSilverCoin);
    const silverPct = silverCoins.length > 0 ? Math.round((silverCoins.filter(c => c.acquired).length / silverCoins.length) * 100) : 0;

    const isCollapsed = periodIsCollapsed(p);
    const pid = esc(p.id);
    const num = String(++secNum).padStart(2, '0');

    return `
      <section id="period-section-${pid}" class="xa-sec">
        <div class="xp-head xa-head" onclick="toggleCollapse('${pid}')" role="button" aria-expanded="${!isCollapsed}">
          <span class="xp-num">${num}</span>
          <span class="xp-title" style="font-size:19px">${esc(periodDisplayName(p))}</span>
          <span class="xa-tools" onclick="event.stopPropagation()">
            <button onclick="openEditPeriodModal('${pid}')" class="xp-btn" title="Editar período" aria-label="Editar período"><i class="fa-solid fa-pen"></i></button>
            <button onclick="openCreateModal('${pid}')" class="xp-btn" title="Añadir una moneda a este período" aria-label="Añadir una moneda a este período"><i class="fa-solid fa-plus"></i></button>
            <button onclick="toggleCollapse('${pid}')" class="xp-btn" title="${isCollapsed ? 'Desplegar período' : 'Contraer período'}" aria-label="${isCollapsed ? 'Desplegar período' : 'Contraer período'}"><i class="fa-solid fa-angles-${isCollapsed ? 'down' : 'up'}"></i></button>
            <button onclick="flipPeriodCoins('${pid}')" class="xp-btn" title="Girar todas las monedas del período" aria-label="Girar todas las monedas del período"><i class="fa-solid fa-rotate"></i></button>
            <button onclick="togglePeriodMissing('${pid}')" class="xp-btn ${onlyMissingHere ? 'xp-on' : ''}" title="Ver solo las que me faltan de este período" aria-label="Ver solo las que me faltan de este período"><i class="fa-solid fa-circle-exclamation"></i></button>
            <button onclick="togglePeriodOwned('${pid}')" class="xp-btn ${onlyOwnedHere ? 'xp-on' : ''}" title="Ver solo las que tengo de este período" aria-label="Ver solo las que tengo de este período"><i class="fa-solid fa-circle-check"></i></button>
          </span>
        </div>
        <div class="xa-prog">
          <span class="xa-count">${acquiredCount}/${totalCount} · <b>${normalPct}%</b></span>
          ${indiceBars(normalPct, silverPct, silverCoins.length > 0)}
        </div>

        <div class="xa-grid ${isCollapsed ? 'hidden' : ''}">
          ${(isCollapsed ? [] : periodCoins).map(renderCoinCard).join('')}
          ${(!isCollapsed && periodCoins.length === 0) ? `<p class="xa-msg">${allPeriodCoins.length === 0 ? 'Este período aún no tiene monedas. Usa el + para añadir la primera.' : 'No hay monedas que mostrar con este filtro.'}</p>` : ''}
        </div>
      </section>
    `;
  }).join('');

  container.innerHTML = sectionsHtml.trim() !== ''
    ? sectionsHtml
    : `<div class="xp-empty-msg">Ninguna moneda coincide con el filtro.</div>`;
  hydrateImages(container);
}

function renderCoinCard(c, opts) {
  opts = (opts && typeof opts === 'object') ? opts : {};   // (.map le pasa el índice como 2.º argumento)
  let baseStyleClass = 'coin-base-style';
  const mat = (c.cecaMaterial || '').toLowerCase();
  if (mat.includes('oro')) baseStyleClass = 'coin-oro-style';
  if (mat.includes('cobre') || mat.includes('bronce')) baseStyleClass = 'coin-cobre-style';

  const isPlata = isSilverCoin(c);
  const hasCeca = c.cecaMaterial && c.cecaMaterial.trim() !== '';
  const isMoving = !opts.plain && movingCoinId === c.id;

  const cardBorderClass = isMoving
    ? 'coin-moving-active'
    : (c.acquired
      ? ({ F: 'border-[#a3b84a] shadow-[0_0_10px_rgba(163,184,74,0.28)]',      // F: verde pálido amarillento
           TBD: 'border-[#8d8cb3] shadow-[0_0_10px_rgba(141,140,179,0.22)] ' }[bestGrade(c)]   // TBD: morado pálido grisáceo
         || 'border-[#0d9488] shadow-[0_0_10px_rgba(13,148,136,0.25)]')
      : (isPlata ? 'border-[#7f8aa3]/60' : 'border-[#e8d5ac]/20'));

  const cecaOrValue = isPlata
    ? `<span class="xc-price">${computeCoinSilverValue(c) || '0,00 €'}</span>`
    : (hasCeca ? esc(c.cecaMaterial) : '—');

  const id = esc(c.id);
  const denom = esc(c.denom);
  // Círculo del tipo en la esquina superior derecha (los circulantes no llevan marca)
  const type = coinType(c), typeColor = COIN_TYPE_COLORS[type];
  const typeDot = type === DEFAULT_COIN_TYPE ? '' :
    `<span class="absolute top-2 right-2 z-10 w-3.5 h-3.5 rounded-full pointer-events-none" style="background:${typeColor};border:2px solid ${typeColor}" title="${esc(type)}"></span>`;

  // Iconos de formato en la esquina superior izquierda (solo los distintos del formato por defecto, de los ejemplares que se tienen)
  const ownedFormats = [...new Set((c.items || []).filter(i => i && String(i.grade || '').trim() !== '').map(i => i.format).filter(f => f && f !== DEFAULT_ITEM_FORMAT && ITEM_FORMATS.some(x => x.id === f)))];
  const formatMark = ownedFormats.length === 0 ? '' :
    `<span class="absolute top-2 left-2 z-10 flex gap-0.5 pointer-events-none" style="color:var(--xp-sand)" title="${esc(ownedFormats.map(f => ITEM_FORMATS.find(x => x.id === f).label).join(', '))}">${ownedFormats.map(f => itemFormatIcon(f, 15)).join('')}</span>`;

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
      class="xc ${cardBorderClass}">

      ${typeDot}
      ${formatMark}

      ${opts.extra || ''}

      ${isMoving ? `
        <div class="xc-move">
          <button onclick="event.stopPropagation(); moveCoin('${id}', -1)">
            <i class="fa-solid fa-arrow-left text-[9px]"></i>
          </button>
          <span class="text-[8px] font-bold uppercase tracking-widest">Mover</span>
          <button onclick="event.stopPropagation(); moveCoin('${id}', 1)">
            <i class="fa-solid fa-arrow-right text-[9px]"></i>
          </button>
        </div>
      ` : ''}

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

      <div class="w-full mt-2 space-y-1.5">
        <div class="xc-denom">
          ${denom}
        </div>

        <div class="flex gap-1 w-full">
          <div class="xc-cell xc-soft w-[55%] tracking-wider">
            ${esc(formatYearRange(c.range))}
          </div>
          <div class="xc-cell w-[45%]" style="${c.rarity ? getRarityStyle(c.rarity) : 'background:rgba(232,213,172,.16);color:#E8D5AC;'}">
            ${esc(c.rarity || '-')}
          </div>
        </div>

        <div class="flex gap-1 w-full">
          <div class="xc-cell xc-km w-[45%]">
            ${esc(c.km || 'KM#-')}
          </div>
          <div class="xc-cell xc-soft w-[55%]" style="font-weight:600;font-size:11px">
            ${cecaOrValue}
          </div>
        </div>

        ${isMoving ? `
          <button onclick="event.stopPropagation(); setMovingCoin('${id}')" class="xc-ok">
            Listo
          </button>
        ` : ''}
      </div>
    </div>
  `;
}
