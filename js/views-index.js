/* ===== VISTA ÍNDICE ===== */
function onIndiceSearchInput(val) {
  indiceSearchText = val.trim();
  renderIndiceView();
}

// Por defecto los períodos salen contraídos (la búsqueda solo filtra países, no abre ni filtra épocas)
function isIndiceCollapsed(countryId) {
  const v = indiceCollapsedCountries[countryId];
  return v === undefined ? true : v;
}
// Texto predictivo: solo salen los países cuyo nombre EMPIEZA por lo escrito (sin tildes ni mayúsculas)
// Búsqueda sin tildes ni mayúsculas: «peru» encuentra «Perú»
const indiceNorm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function expandAllIndice() {
  countries.forEach(c => { indiceCollapsedCountries[c.id] = false; });
  renderIndiceView();
}

function collapseAllIndice() {
  countries.forEach(c => { indiceCollapsedCountries[c.id] = true; });
  renderIndiceView();
}

// v8.10: un solo botón. Si algún país del listado está desplegado, contrae todos; si están todos contraídos, los despliega
function indiceVisibleCountries() {
  const s = indiceNorm(indiceSearchText);
  return countries.filter(c => !s || indiceNorm(c.name).startsWith(s));
}
function toggleAllIndice() {
  if (indiceVisibleCountries().some(c => !isIndiceCollapsed(c.id))) collapseAllIndice(); else expandAllIndice();
}
function updateIndiceToggle() {
  const btn = document.getElementById('indice-toggle'); if (!btn) return;
  const anyOpen = indiceVisibleCountries().some(c => !isIndiceCollapsed(c.id));
  const t = anyOpen ? 'Contraer todo' : 'Expandir todo';
  btn.title = t; btn.setAttribute('aria-label', t);
  btn.innerHTML = `<i class="fa-solid fa-angles-${anyOpen ? 'up' : 'down'}"></i>`;
}

function toggleIndiceCountry(countryId) {
  indiceCollapsedCountries[countryId] = !isIndiceCollapsed(countryId);
  renderIndiceView();
}

function jumpToCountry(countryId) {
  currentCountryId = countryId;
  albumPeriodId = ''; albumGroup = '';
  switchTab('album');
  window.scrollTo(0, 0);   // al ir a un país se llega a su principio (solo una época concreta baja hasta su sección)
}

function jumpToPeriod(periodId) {
  const p = periodById(periodId);
  if (!p) return;
  currentCountryId = p.countryId;
  albumPeriodId = '';   // el Álbum muestra todos los períodos; solo se baja hasta el elegido
  p.collapsed = false;
  if (coinsOfPeriod(periodId).length === 0) periodForceOpen[periodId] = true;   // se pidió ese período: se abre aunque esté vacío
  persistMeta();
  switchTab('album');
  setTimeout(() => {
    const el = document.getElementById(`period-section-${periodId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

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
    updateIndiceToggle();
    return;
  }

  const search = indiceNorm(indiceSearchText);

  const html = list.map(country => {
    const ps = periodsOfCountry(country.id);

    if (search && !indiceNorm(country.name).startsWith(search)) return '';   // solo se busca por nombre de país
    const matching = ps;

    const shown = new Set(ps.map(p => p.id));
    const normal = completionList(coinsOfCountry(country.id).filter(c => shown.has(c.periodId))).filter(c => !isSilverCoin(c));   // v7.08: las variantes no cuentan
    const cAcquired = normal.filter(c => c.acquired).length;
    const cTotal = normal.length;
    const cPct = cTotal > 0 ? Math.round((cAcquired / cTotal) * 100) : 0;
    const isCollapsed = isIndiceCollapsed(country.id);
    const zoneLabel = continentOf(country);
    const flagBg = flagLayers(country).replace(/"/g, '&quot;');

    return `
      <div class="xi-card">
        <div class="xi-head">
          <div class="xi-main" onclick="jumpToCountry('${esc(country.id)}')">
            <div class="xi-donut" style="--progress: ${cPct}%;"><div>${cPct}%</div></div>
            <span class="xi-flag" style="background:${flagBg}" role="img" aria-label="Bandera de ${esc(country.name)}"></span>
            <div class="min-w-0">
              <h3 class="xi-name truncate">${esc(country.name)}</h3>
              <div class="xi-subrow"><span class="xi-tag" title="Zona geográfica">${esc(zoneLabel)}</span></div>
            </div>
          </div>
          <button onclick="toggleIndiceCountry('${esc(country.id)}')" class="xi-btn xi-go" aria-label="${isCollapsed ? 'Desplegar' : 'Contraer'}"><i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'}"></i></button>
        </div>

        <div class="xi-periods ${isCollapsed ? 'hidden' : ''}">
          ${matching.map(p => {
            const periodCoins = completionList(coinsOfPeriod(p.id));   // v7.08: las variantes no cuentan
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
        </div>
      </div>
    `;
  }).filter(Boolean).join('');

  container.innerHTML = html !== '' ? html : `<div class="xp-empty-msg">No se encontraron datos coincidentes.</div>`;
  updateIndiceToggle();
}
