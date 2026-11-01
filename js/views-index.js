/* ===== VISTA ÍNDICE ===== */
function onIndiceSearchInput(val) {
  indiceSearchText = val.trim();
  renderIndiceView();
}

// Por defecto los períodos salen contraídos; si hay búsqueda se muestran para ver las coincidencias
function isIndiceCollapsed(countryId) {
  const v = indiceCollapsedCountries[countryId];
  if (v === undefined) return !indiceSearchText;
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
  albumPeriodId = ''; albumGroup = '';
  switchTab('album');
}

function jumpToPeriod(periodId) {
  const p = periodById(periodId);
  if (!p) return;
  currentCountryId = p.countryId;
  albumPeriodId = periodId;
  p.collapsed = false;
  if (coinsOfPeriod(periodId).length === 0) periodForceOpen[periodId] = true;   // se pidió ese período: se abre aunque esté vacío
  persistMeta();
  switchTab('album');
  setTimeout(() => {
    const el = document.getElementById(`period-section-${periodId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function addPeriodFromIndice(countryId) { currentCountryId = countryId; openAddPeriodModal(countryId); }
function editCountryFromIndice(countryId) { currentCountryId = countryId; openEditCountryModal(); }
function editPeriodFromIndice(periodId) {
  const p = periodById(periodId);
  if (!p) return;
  currentCountryId = p.countryId;
  openEditPeriodModal(periodId);
}

// Barra de progreso (normal + plata) con los colores del estilo póster
function indiceBars(normalPct, silverPct, hasSilver) {
  const tr = (cls, pct, w, title) => `<div class="xs-track" style="width:${w}"${title ? ` title="${title}"` : ''}><i class="${cls}" style="width:${pct}%"></i></div>`;
  return `<div class="xi-bars">${tr('', normalPct, hasSilver ? '75%' : '100%')}${hasSilver ? tr('silver-gradient-fill', silverPct, '25%', 'Monedas de Plata') : ''}</div>`;
}

function renderIndiceView() {
  const container = document.getElementById('indice-countries-container');
  const list = [...countries].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  if (list.length === 0) {
    container.innerHTML = `<div class="xp-empty-msg">No hay datos en el índice.</div>`;
    return;
  }

  const search = indiceSearchText.toLowerCase();

  const html = list.map(country => {
    const ps = periodsOfCountry(country.id);

    const matchesCountry = country.name.toLowerCase().includes(search);
    const matching = ps.filter(p => matchesCountry || p.name.toLowerCase().includes(search));
    if (search && !matchesCountry && matching.length === 0) return '';

    const shown = new Set(ps.map(p => p.id));
    const normal = coinsOfCountry(country.id).filter(c => shown.has(c.periodId) && !isSilverCoin(c));
    const cAcquired = normal.filter(c => c.acquired).length;
    const cTotal = normal.length;
    const cPct = cTotal > 0 ? Math.round((cAcquired / cTotal) * 100) : 0;
    const isCollapsed = isIndiceCollapsed(country.id);
    const banner = `linear-gradient(90deg,rgba(61,26,84,.96) 0%,rgba(61,26,84,.80) 45%,rgba(61,26,84,.25) 100%),${flagLayers(country)}`;

    return `
      <div class="xi-card">
        <div class="xi-head" style="background:${banner.replace(/"/g, '&quot;')}">
          <div class="xi-main" onclick="jumpToCountry('${esc(country.id)}')">
            <div class="xi-donut" style="--progress: ${cPct}%;"><div>${cPct}%</div></div>
            <div class="min-w-0">
              <h3 class="xi-name truncate">${esc(country.name)}</h3>
              <p class="xi-sub">${cAcquired} de ${cTotal} monedas</p>
            </div>
          </div>
          <button onclick="editCountryFromIndice('${esc(country.id)}')" class="xi-btn" title="Editar país" aria-label="Editar país"><i class="fa-solid fa-pen"></i></button>
          <button onclick="toggleIndiceCountry('${esc(country.id)}')" class="xi-btn xi-go" aria-label="${isCollapsed ? 'Desplegar' : 'Contraer'}"><i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'}"></i></button>
        </div>

        <div class="xi-periods ${isCollapsed ? 'hidden' : ''}">
          ${matching.map(p => {
            const periodCoins = coinsOfPeriod(p.id);
            const normalCoins = periodCoins.filter(c => !isSilverCoin(c));
            const pAcquired = normalCoins.filter(c => c.acquired).length;
            const pTotal = normalCoins.length;
            const pPct = pTotal > 0 ? Math.round((pAcquired / pTotal) * 100) : 0;
            const silverCoins = periodCoins.filter(isSilverCoin);
            const pSilverPct = silverCoins.length > 0 ? Math.round((silverCoins.filter(c => c.acquired).length / silverCoins.length) * 100) : 0;
            return `
              <div onclick="jumpToPeriod('${esc(p.id)}')" class="xi-period">
                <div class="xi-prow">
                  <div class="xi-pname"><i></i><span>${esc(periodDisplayName(p))}</span></div>
                  <div class="xi-pmeta">
                    <button onclick="event.stopPropagation(); editPeriodFromIndice('${esc(p.id)}')" class="xi-pedit" title="Editar período" aria-label="Editar período"><i class="fa-solid fa-pen"></i></button>
                    <span>${pAcquired}/${pTotal} · <b>${pPct}%</b></span>
                    <i class="fa-solid fa-arrow-right" style="font-size:10px"></i>
                  </div>
                </div>
                ${indiceBars(pPct, pSilverPct, silverCoins.length > 0)}
              </div>
            `;
          }).join('')}
          ${search ? '' : `<button type="button" onclick="addPeriodFromIndice('${esc(country.id)}')" class="xi-addperiod"><i class="fa-solid fa-plus"></i> Añadir período</button>`}
        </div>
      </div>
    `;
  }).filter(Boolean).join('');

  container.innerHTML = html !== '' ? html : `<div class="xp-empty-msg">No se encontraron datos coincidentes.</div>`;
}
