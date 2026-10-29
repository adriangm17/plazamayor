/* ===== VISTA ÍNDICE ===== */
function onIndiceSearchInput(val) {
  indiceSearchText = val.trim();
  renderIndiceView();
}

function filterByTag(tag) {
  selectedTagFilter = (selectedTagFilter === tag) ? '' : tag;
  renderIndiceView();
}

// Por defecto los períodos salen contraídos; si hay búsqueda o etiqueta activa se muestran para ver las coincidencias
function isIndiceCollapsed(countryId) {
  const v = indiceCollapsedCountries[countryId];
  if (v === undefined) return !(indiceSearchText || selectedTagFilter);
  return v;
}

function expandAllIndice() {
  countries.forEach(c => { indiceCollapsedCountries[c.id] = false; });
  renderIndiceView();
}

function collapseAllIndice() {
  countries.forEach(c => { indiceCollapsedCountries[c.id] = true; });
  renderIndiceView();
}

function toggleIndiceCountry(countryId) {
  indiceCollapsedCountries[countryId] = !isIndiceCollapsed(countryId);
  renderIndiceView();
}

function jumpToCountry(countryId) {
  currentCountryId = countryId;
  albumPeriodId = '';
  switchTab('album');
}

function jumpToPeriod(periodId) {
  const p = periodById(periodId);
  if (!p) return;
  currentCountryId = p.countryId;
  albumPeriodId = periodId;
  p.collapsed = false;
  persistMeta();
  switchTab('album');
  setTimeout(() => {
    const el = document.getElementById(`period-section-${periodId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function editCountryFromIndice(countryId) { currentCountryId = countryId; openEditCountryModal(); }
function editPeriodFromIndice(periodId) {
  const p = periodById(periodId);
  if (!p) return;
  currentCountryId = p.countryId;
  openEditPeriodModal(periodId);
}

function renderIndiceView() {
  const container = document.getElementById('indice-countries-container');
  const tagsBar = document.getElementById('indice-tags-bar');
  const list = [...countries].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  if (list.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-gray-500 text-xs">No hay datos en el índice.</div>`;
    tagsBar.innerHTML = '';
    return;
  }

  const allTags = new Set();
  countries.forEach(c => (c.tags || []).forEach(t => allTags.add(t)));
  periods.forEach(p => (p.tags || []).forEach(t => allTags.add(t)));
  if (selectedTagFilter && !allTags.has(selectedTagFilter)) selectedTagFilter = '';
  const tagList = Array.from(allTags).sort();
  tagsBar.innerHTML = tagList.map(tag => `
    <button onclick="filterByTag('${jsArg(tag)}')" class="px-2.5 py-1 rounded-lg text-[10px] font-bold border whitespace-nowrap transition ${selectedTagFilter === tag ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'}">
      ${esc(tag)}
    </button>
  `).join('');

  const search = indiceSearchText.toLowerCase();

  const html = list.map(country => {
    const cTags = country.tags || [];
    let ps = periodsOfCountry(country.id);

    // Etiqueta activa: si la tiene el país salen todas sus épocas; si no, solo las que la llevan.
    if (selectedTagFilter && !cTags.includes(selectedTagFilter)) {
      ps = ps.filter(p => (p.tags || []).includes(selectedTagFilter));
      if (ps.length === 0) return '';
    }

    const matchesCountry = country.name.toLowerCase().includes(search) || cTags.some(t => t.toLowerCase().includes(search));
    const matching = ps.filter(p => matchesCountry || p.name.toLowerCase().includes(search) || (p.tags || []).some(t => t.toLowerCase().includes(search)));
    if (search && !matchesCountry && matching.length === 0) return '';

    const shown = new Set(ps.map(p => p.id));
    const normal = coinsOfCountry(country.id).filter(c => shown.has(c.periodId) && !isSilverCoin(c));
    const cAcquired = normal.filter(c => c.acquired).length;
    const cTotal = normal.length;
    const cPct = cTotal > 0 ? Math.round((cAcquired / cTotal) * 100) : 0;
    const isCollapsed = isIndiceCollapsed(country.id);

    return `
      <div class="bg-[#141b2a] border border-slate-800/80 rounded-2xl p-3.5 shadow-lg space-y-2.5">
        <div class="flex items-center justify-between rounded-xl p-2" style="background:${flagBanner(country)}">
          <div class="flex items-center gap-3 cursor-pointer flex-1 min-w-0" onclick="jumpToCountry('${esc(country.id)}')">
            <div class="relative w-11 h-11 shrink-0 flex items-center justify-center">
              <div class="w-full h-full progress-donut p-1.5 flex items-center justify-center" style="--progress: ${cPct}%;">
                <div class="w-full h-full bg-[#141b2a] rounded-full flex items-center justify-center">
                  <span class="text-[10px] font-black text-white font-serif-numis">${cPct}%</span>
                </div>
              </div>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold text-white font-serif-numis tracking-tight hover:text-amber-400 transition truncate">${esc(country.name)}</h3>
                <div class="flex flex-wrap gap-1">
                  ${cTags.map(t => `<span class="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1 rounded font-mono">${esc(t)}</span>`).join('')}
                </div>
              </div>
              <p class="text-[11px] text-slate-400 font-medium">${cAcquired} de ${cTotal} monedas</p>
            </div>
          </div>
          <button onclick="editCountryFromIndice('${esc(country.id)}')" class="w-8 h-8 rounded-xl bg-slate-800/60 text-slate-400 hover:text-amber-400 flex items-center justify-center transition ml-2" title="Editar país y etiquetas"><i class="fa-solid fa-pen text-[10px]"></i></button>
          <button onclick="toggleIndiceCountry('${esc(country.id)}')" class="w-8 h-8 rounded-xl bg-slate-800/60 text-amber-400 hover:bg-slate-700 flex items-center justify-center transition ml-2">
            <i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'} text-xs"></i>
          </button>
        </div>

        <div class="space-y-2 pt-2 border-t border-slate-800/80 ${isCollapsed ? 'hidden' : ''}">
          ${matching.map(p => {
            const periodCoins = coinsOfPeriod(p.id);
            const normalCoins = periodCoins.filter(c => !isSilverCoin(c));
            const pAcquired = normalCoins.filter(c => c.acquired).length;
            const pTotal = normalCoins.length;
            const pPct = pTotal > 0 ? Math.round((pAcquired / pTotal) * 100) : 0;
            const silverCoins = periodCoins.filter(isSilverCoin);
            const pSilverPct = silverCoins.length > 0 ? Math.round((silverCoins.filter(c => c.acquired).length / silverCoins.length) * 100) : 0;
            return `
              <div onclick="jumpToPeriod('${esc(p.id)}')" class="bg-[#182132] hover:bg-slate-800 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1 cursor-pointer transition group">
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center space-x-2 min-w-0">
                    <i class="fa-solid fa-circle text-[6px] text-amber-400"></i>
                    <span class="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition truncate">${esc(periodDisplayName(p))}</span>
                    ${(p.tags || []).map(t => `<span class="text-[8px] bg-slate-800 text-slate-400 border border-slate-700 px-1 rounded font-mono">${esc(t)}</span>`).join('')}
                  </div>
                  <div class="flex items-center space-x-2.5 shrink-0">
                    <button onclick="event.stopPropagation(); editPeriodFromIndice('${esc(p.id)}')" class="text-slate-500 hover:text-amber-400 px-1" title="Editar período y etiquetas"><i class="fa-solid fa-pen text-[10px]"></i></button>
                    <span class="text-[10px] text-slate-400 font-medium">${pAcquired}/${pTotal} (${pPct}%)</span>
                    <i class="fa-solid fa-arrow-right text-[10px] text-slate-600 group-hover:text-amber-400 transition"></i>
                  </div>
                </div>
                ${renderDualProgressBar(pPct, pSilverPct, silverCoins.length > 0)}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).filter(Boolean).join('');

  container.innerHTML = html !== '' ? html : `<div class="text-center py-10 text-gray-500 text-xs">No se encontraron datos coincidentes.</div>`;
}
