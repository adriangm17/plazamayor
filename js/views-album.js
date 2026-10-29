/* ===== VISTA ÁLBUM ===== */
let pressTimer = null;
let isLongPress = false;

function validAlbumPeriod() {
  if (albumPeriodId && !periodsOfCountry(currentCountryId).some(p => p.id === albumPeriodId)) albumPeriodId = '';
  return albumPeriodId;
}

function renderTabs() {
  const list = sortedCountries();
  if (!countryById(currentCountryId) && list.length > 0) currentCountryId = list[0].id;
  validAlbumPeriod();
  const country = countryById(currentCountryId);
  document.getElementById('album-country-title').innerHTML = country
    ? `<i class="fa-solid fa-chevron-left text-[10px] text-amber-400"></i>${flagChip(country, 32, 22)}<span class="text-xl font-black text-white font-serif-numis tracking-tight truncate">${esc(country.name)}</span>`
    : '';
  const bar = document.getElementById('period-bar');
  if (bar && country) bar.style.background = flagTint(country);
  const ps = periodsOfCountry(currentCountryId);
  const pill = (active) => `px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${active ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-[#151c2c] text-gray-400 border border-slate-800'}`;
  document.getElementById('period-tabs').innerHTML =
    `<button onclick="selectPeriodTab('')" class="${pill(!albumPeriodId)}">Todas</button>` +
    ps.map(p => `<button onclick="selectPeriodTab('${jsArg(p.id)}')" class="${pill(p.id === albumPeriodId)}">${esc(periodDisplayName(p))}</button>`).join('');
}

function selectPeriodTab(periodId) {
  albumPeriodId = periodId;
  const p = periodById(periodId);
  if (p && p.collapsed) { p.collapsed = false; persistMeta(); }
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
    ? `<div class="px-3 py-2 text-[11px] text-slate-500">Ningún país empieza por "${esc(value.trim())}"</div>`
    : list.map(c => `
      <button onmousedown="event.preventDefault()" onclick="pickCountrySuggestion('${jsArg(c.id)}')" class="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 border-b border-slate-800/60 last:border-0 ${c.id === currentCountryId ? 'text-amber-400' : ''}">
        <span class="flex items-center gap-2">${flagChip(c, 20, 14)}<span><b class="text-amber-400">${esc(c.name.slice(0, n))}</b>${esc(c.name.slice(n))}</span></span>
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
  currentCountryId = countryId;
  albumPeriodId = '';
  movingCoinId = null;
  render();
}

function expandAllPeriods() {
  periodsOfCountry(currentCountryId).forEach(p => { p.collapsed = false; });
  persistMeta();
  renderSections();
}

function collapseAllPeriods() {
  periodsOfCountry(currentCountryId).forEach(p => { p.collapsed = true; });
  persistMeta();
  renderSections();
}

function toggleCollapse(periodId) {
  const p = periodById(periodId);
  if (!p) return;
  p.collapsed = !p.collapsed;
  persistMeta();
  renderSections();
}

function setPeriodSortMode(periodId, mode) {
  const p = periodById(periodId);
  if (!p) return;
  p.sortMode = mode;
  persistMeta();
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
  renderSections();
}

/* ----- Filtros ----- */
function isAlbumFilterActive() {
  return albumSearch.trim() !== '' || albumOnlyMissing;
}

function matchesAlbumFilter(c) {
  if (albumOnlyMissing && c.acquired) return false;
  const q = albumSearch.trim().toLowerCase();
  if (!q) return true;
  const p = periodById(c.periodId);
  const haystack = [c.denom, c.km, c.cecaMaterial, c.rarity, c.range, p ? p.name : '', c.year, c.grade]
    .map(v => String(v ?? '').toLowerCase()).join(' ');
  return q.split(/\s+/).every(word => haystack.includes(word));
}

function onAlbumSearchInput(value) {
  albumSearch = value;
  renderSections();
}

function toggleOnlyMissing() {
  albumOnlyMissing = !albumOnlyMissing;
  const btn = document.getElementById('btn-only-missing');
  if (btn) {
    btn.className = 'shrink-0 px-3 py-2.5 rounded-xl text-[11px] font-bold border transition ' +
      (albumOnlyMissing ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-900 text-slate-300 border-slate-800');
  }
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
  const inner = document.getElementById(`grid-coin-inner-${coinId}`);
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
function renderSections() {
  const container = document.getElementById('album-sections');
  const filtered = coinsOfCountry(currentCountryId);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-gray-500 text-xs">No hay monedas registradas en este país.</div>`;
    return;
  }

  const filterActive = isAlbumFilterActive();

  const onlyPeriod = validAlbumPeriod();
  const sectionsHtml = periodsOfCountry(currentCountryId).filter(p => !onlyPeriod || p.id === onlyPeriod).map(p => {
    const allPeriodCoins = filtered.filter(c => c.periodId === p.id);
    const periodCoins = allPeriodCoins.filter(matchesAlbumFilter).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (filterActive && periodCoins.length === 0) return '';

    const sortMode = p.sortMode || 'default';
    if (sortMode === 'missing_first') {
      periodCoins.sort((a, b) => {
        if (a.acquired === b.acquired) return (a.order ?? 0) - (b.order ?? 0);
        return a.acquired ? 1 : -1;
      });
    }

    const normalCoins = allPeriodCoins.filter(c => !isSilverCoin(c));
    const acquiredCount = normalCoins.filter(c => c.acquired).length;
    const totalCount = normalCoins.length;
    const normalPct = totalCount > 0 ? Math.round((acquiredCount / totalCount) * 100) : 0;
    const silverCoins = allPeriodCoins.filter(isSilverCoin);
    const silverPct = silverCoins.length > 0 ? Math.round((silverCoins.filter(c => c.acquired).length / silverCoins.length) * 100) : 0;

    const isCollapsed = !!p.collapsed;
    const pid = esc(p.id);

    return `
      <div id="period-section-${pid}" class="bg-[#151c2c]/70 border border-slate-800/80 rounded-2xl p-2.5 space-y-2">
        <div class="border-b border-slate-800 pb-2 px-0.5 space-y-1.5">
          <div class="flex flex-wrap justify-between items-center gap-1.5">
            <div class="flex items-center space-x-1.5 min-w-0">
              <div class="cursor-pointer select-none flex items-center space-x-1.5 min-w-0" onclick="toggleCollapse('${pid}')">
                <i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'} text-[11px] text-amber-400 shrink-0"></i>
                <h3 class="text-xs sm:text-sm font-black text-amber-400 uppercase tracking-wider truncate">${esc(periodDisplayName(p))}</h3>
              </div>
              ${(p.tags || []).map(t => `<span class="text-[8px] bg-slate-800 text-slate-400 border border-slate-700 px-1 rounded font-mono shrink-0">${esc(t)}</span>`).join('')}
              <button onclick="openEditPeriodModal('${pid}')" class="text-slate-500 hover:text-amber-400 text-xs px-1 py-0.5 rounded transition shrink-0" title="Editar período y etiquetas">
                <i class="fa-solid fa-pen text-[10px]"></i>
              </button>
            </div>

            <div class="flex items-center space-x-1.5">
              <div class="bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-lg flex items-center gap-1">
                <span class="text-[10px] font-bold text-amber-400">${acquiredCount}/${totalCount}</span>
                <span class="text-[10px] font-black text-amber-300">(${normalPct}%)</span>
              </div>

              <div class="flex items-center bg-[#182030] rounded-lg p-0.5 border border-slate-800">
                <button onclick="setPeriodSortMode('${pid}', 'default')"
                  class="px-1.5 py-0.5 text-[10px] font-bold rounded-md transition ${sortMode === 'default' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}">
                  <i class="fa-solid fa-arrow-down-1-9"></i> Def.
                </button>
                <button onclick="setPeriodSortMode('${pid}', 'missing_first')"
                  class="px-1.5 py-0.5 text-[10px] font-bold rounded-md transition ${sortMode === 'missing_first' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}">
                  <i class="fa-solid fa-circle-exclamation"></i> Faltan
                </button>
              </div>

              <div class="flex space-x-0.5">
                <button onclick="movePeriod('${pid}', -1)" class="text-gray-500 hover:text-white p-1 text-[10px]"><i class="fa-solid fa-arrow-up"></i></button>
                <button onclick="movePeriod('${pid}', 1)" class="text-gray-500 hover:text-white p-1 text-[10px]"><i class="fa-solid fa-arrow-down"></i></button>
              </div>
            </div>
          </div>

          ${renderDualProgressBar(normalPct, silverPct, silverCoins.length > 0)}
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 ${isCollapsed ? 'hidden' : ''}">
          ${(isCollapsed ? [] : periodCoins).map(renderCoinCard).join('')}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = sectionsHtml.trim() !== ''
    ? sectionsHtml
    : `<div class="text-center py-10 text-gray-500 text-xs">Ninguna moneda coincide con el filtro.</div>`;
  hydrateImages(container);
}

function renderCoinCard(c) {
  let baseStyleClass = 'coin-base-style';
  const mat = (c.cecaMaterial || '').toLowerCase();
  if (mat.includes('oro')) baseStyleClass = 'coin-oro-style';
  if (mat.includes('cobre') || mat.includes('bronce')) baseStyleClass = 'coin-cobre-style';

  const isPlata = isSilverCoin(c);
  const hasCeca = c.cecaMaterial && c.cecaMaterial.trim() !== '';
  const isMoving = movingCoinId === c.id;

  const cardBorderClass = isMoving
    ? 'coin-moving-active'
    : (c.acquired
      ? 'border-[#0d9488] shadow-[0_0_10px_rgba(13,148,136,0.25)]'
      : (isPlata ? 'border-[#94a3b8] shadow-[0_0_12px_rgba(148,163,184,0.25)]' : 'border-slate-800'));

  const cecaOrValue = isPlata
    ? `<span class="text-emerald-400 font-black">${computeCoinSilverValue(c) || '0,00 €'}</span>`
    : (hasCeca ? esc(c.cecaMaterial) : '—');

  const id = esc(c.id);
  const denom = esc(c.denom);

  return `
    <div
      id="coin-card-${id}"
      onmousedown="handleCoinTouchStart(event, '${id}')"
      onmouseup="handleCoinTouchEnd(event, '${id}')"
      onmouseleave="handleCoinTouchEnd(event, '${id}')"
      ontouchstart="handleCoinTouchStart(event, '${id}')"
      ontouchend="handleCoinTouchEnd(event, '${id}')"
      ontouchmove="handleCoinTouchMove(event)"
      onclick="handleCoinClick(event, '${id}')"
      class="bg-[#151c2c] border ${cardBorderClass} rounded-2xl p-1.5 flex flex-col items-center justify-between hover:border-amber-500/50 transition shadow-lg relative group cursor-pointer w-full select-none">

      ${isMoving ? `
        <div class="w-full bg-amber-500/20 border border-amber-500/50 rounded-xl p-1 mb-1 flex items-center justify-between text-amber-400 z-20">
          <button onclick="event.stopPropagation(); moveCoin('${id}', -1)" class="w-5 h-5 bg-amber-500 text-slate-950 font-bold rounded-lg flex items-center justify-center hover:bg-amber-400 transition">
            <i class="fa-solid fa-arrow-left text-[9px]"></i>
          </button>
          <span class="text-[8px] font-bold uppercase tracking-widest text-amber-300">Mover</span>
          <button onclick="event.stopPropagation(); moveCoin('${id}', 1)" class="w-5 h-5 bg-amber-500 text-slate-950 font-bold rounded-lg flex items-center justify-center hover:bg-amber-400 transition">
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

      <div class="w-full mt-1 space-y-1">
        <div class="w-full bg-[#1e293b] text-white font-black text-sm sm:text-base py-0.5 px-1 rounded border border-slate-700/80 truncate shadow-inner text-center leading-tight">
          ${denom}
        </div>

        <div class="flex gap-1 w-full">
          <div class="w-[55%] bg-[#1e293b] text-white font-black text-xs sm:text-sm py-0.5 px-0.5 rounded border border-slate-700/80 tracking-wider truncate flex items-center justify-center leading-tight">
            ${esc(formatYearRange(c.range))}
          </div>
          <div class="w-[45%] font-black text-xs sm:text-sm py-0.5 px-0.5 rounded border border-slate-700/80 truncate text-center flex items-center justify-center shadow-inner leading-tight" style="${getRarityStyle(c.rarity)}">
            ${esc(c.rarity || '-')}
          </div>
        </div>

        <div class="flex gap-1 w-full">
          <div class="w-[45%] bg-[#334155] text-white font-black text-xs sm:text-sm py-0.5 px-0.5 rounded border border-slate-600/80 truncate text-center flex items-center justify-center leading-tight">
            ${esc(c.km || 'KM#-')}
          </div>
          <div class="w-[55%] bg-[#182030] text-white font-normal text-[11px] sm:text-xs py-0.5 px-0.5 rounded border border-slate-700/80 truncate text-center flex items-center justify-center leading-tight">
            ${cecaOrValue}
          </div>
        </div>

        ${isMoving ? `
          <button onclick="event.stopPropagation(); setMovingCoin('${id}')" class="w-full mt-1 bg-slate-800 text-amber-400 hover:bg-slate-700 text-xs font-bold py-1 px-2 rounded-lg border border-slate-700 transition">
            Listo
          </button>
        ` : ''}
      </div>
    </div>
  `;
}
