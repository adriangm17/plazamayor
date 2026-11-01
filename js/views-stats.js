/* ===== VISTA ESTADÍSTICAS =====
   Una ficha es mía si algún ejemplar tiene estado (grado). Entonces cada fila de ejemplar de la ficha es una moneda mía
   (aunque aún no tenga estado o año): los repetidos cuentan en el total, el peso y el valor, pero no en las únicas. */
const STATS_PAGE_SIZE = 40;  // fichas por hoja en la página de un estado
let statsGradePage = 1;
let statsNoYearOpen = false; // lista desplegable de monedas sin año
let statsGrade = '';        // estado de conservación elegido ('' = ninguno)
let statsType = '';         // tipo de moneda elegido ('' = ninguno)
let statsRankAll = false;   // ranking de países: false = top 10, true = todos
let statsRange = null;   // [añoDesde, añoHasta] al ampliar la línea de tiempo

function collectionStats() {
  const s = { total: 0, unique: 0, silverCount: 0, silverNoWeight: 0, gross: 0, fine: 0, byYear: {}, noYear: 0, prog: { n: { a: 0, t: 0 }, s: { a: 0, t: 0 } }, byCountry: {}, grades: {}, noGrade: 0, noYearBy: {} };
  coins.forEach(c => {
    const pk = s.prog[isSilverCoin(c) ? 's' : 'n']; pk.t++; if (c.acquired) pk.a++;
    const rows = (Array.isArray(c.items) ? c.items : []).filter(i => i && typeof i === 'object');
    const owned = rows.some(i => String(i.grade || '').trim() !== '') ? rows : [];
    if (!owned.length) return;
    s.total += owned.length; s.unique++;
    s.byCountry[c.countryId] = (s.byCountry[c.countryId] || 0) + owned.length;
    if (isSilverCoin(c)) {
      const w = parseFloat(c.silverWeight) || 0;
      let p = parseFloat(c.silverPurity) || 0; if (p > 0 && p <= 1) p *= 1000;
      s.silverCount += owned.length;
      if (w > 0) { s.gross += w * owned.length; s.fine += w * (p / 1000) * owned.length; } else s.silverNoWeight += owned.length;
    }
    owned.forEach(i => {
      const g = String(i.grade || '').trim(); if (g) s.grades[g] = (s.grades[g] || 0) + 1; else s.noGrade++;
      const m = String(i.year || '').match(/\d{4}/);
      if (m) s.byYear[+m[0]] = (s.byYear[+m[0]] || 0) + 1; else { s.noYear++; (s.noYearBy[c.id] ||= { c, n: 0 }).n++; }
    });
  });
  s.eur = s.fine * currentSilverPricePerGram;
  return s;
}

const fmtN = (n, d = 2) => n.toLocaleString('es-ES', { maximumFractionDigits: d });
const niceStep = (raw, list) => list.find(v => v >= raw) || list[list.length - 1];

function statsChartHTML(byYear) {
  const years = Object.keys(byYear).map(Number);
  if (!years.length) return `<p class="xp-empty-msg">Aún no hay monedas con año registrado.</p>`;
  const dMin = Math.min(...years), dMax = Math.max(...years);
  let [a, b] = statsRange || [dMin, dMax];
  if (statsRange && (b < dMin || a > dMax)) { statsRange = null; a = dMin; b = dMax; }
  if (a === b) { a -= 1; b += 1; }
  const n = b - a + 1;
  const W = 360, H = 210, L = 30, R = 6, T = 8, B = 24, pw = W - L - R, ph = H - T - B;
  const vis = years.filter(y => y >= a && y <= b);
  const maxV = Math.max(1, ...vis.map(y => byYear[y]));
  const ystep = niceStep(maxV / 4, [1, 2, 5, 10, 20, 50, 100, 200, 500]);
  const yMax = Math.ceil(maxV / ystep) * ystep;
  const slot = pw / n, bw = Math.max(1, Math.min(slot * 0.72, 18));
  const X = y => L + (y - a) * slot + slot / 2, Y = v => T + ph - (v / yMax) * ph;
  let g = '';
  for (let v = 0; v <= yMax; v += ystep) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(61,26,84,.14)"/><text x="${L - 4}" y="${Y(v) + 3}" text-anchor="end" font-size="9" fill="#6f5a73">${v}</text>`;
  const xstep = niceStep((b - a) / 6, [1, 2, 5, 10, 20, 25, 50, 100]);
  for (let y = Math.ceil(a / xstep) * xstep; y <= b; y += xstep) g += `<line x1="${X(y)}" x2="${X(y)}" y1="${T}" y2="${T + ph}" stroke="rgba(61,26,84,.14)"/><text x="${X(y)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#6f5a73">${y}</text>`;
  const bars = vis.map(y => `<rect x="${(X(y) - bw / 2).toFixed(2)}" y="${Y(byYear[y]).toFixed(2)}" width="${bw.toFixed(2)}" height="${(T + ph - Y(byYear[y])).toFixed(2)}" rx="1.5" fill="#E8702F"><title>${y}: ${byYear[y]} ${byYear[y] === 1 ? 'moneda' : 'monedas'}</title></rect>`).join('');
  return `<svg id="stats-svg" viewBox="0 0 ${W} ${H}" class="w-full select-none" data-a="${a}" data-n="${n}" data-l="${L}" data-pw="${pw}">
    ${g}<line x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}" stroke="#3D1A54"/>${bars}
    <rect id="stats-sel" x="${L}" y="${T}" width="0" height="${ph}" fill="#E8702F" fill-opacity="0.2"/>
    <rect id="stats-overlay" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent" style="cursor:crosshair;touch-action:none"/>
  </svg>`;
}

function attachStatsChart() {
  const svg = document.getElementById('stats-svg'); if (!svg) return;
  const ov = svg.querySelector('#stats-overlay'), sel = svg.querySelector('#stats-sel');
  const a = +svg.dataset.a, n = +svg.dataset.n, L = +svg.dataset.l, pw = +svg.dataset.pw;
  const px = e => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(pw, (e.clientX - r.left) * (360 / r.width) - L)); };
  let x0 = null;
  ov.addEventListener('pointerdown', e => { x0 = px(e); ov.setPointerCapture(e.pointerId); sel.setAttribute('x', L + x0); sel.setAttribute('width', 0); });
  ov.addEventListener('pointermove', e => { if (x0 === null) return; const x1 = px(e); sel.setAttribute('x', L + Math.min(x0, x1)); sel.setAttribute('width', Math.abs(x1 - x0)); });
  ov.addEventListener('pointerup', e => {
    if (x0 === null) return;
    const x1 = px(e), lo = Math.min(x0, x1), hi = Math.max(x0, x1); x0 = null; sel.setAttribute('width', 0);
    if (hi - lo < 4) return;
    const slot = pw / n, y0 = a + Math.floor(lo / slot), y1 = a + Math.floor(hi / slot);
    if (y1 > y0) { statsRange = [y0, y1]; renderEstadisticas(); }
  });
  svg.addEventListener('contextmenu', e => { e.preventDefault(); statsRange = null; renderEstadisticas(); });
}

function toggleNoYear() { statsNoYearOpen = !statsNoYearOpen; renderEstadisticas(); }
function setStatsGradePage(n) { statsGradePage = n; renderEstadisticas(); window.scrollTo({ top: 0 }); }
function pickStatsGrade(g) { statsGrade = g; statsType = ''; statsGradePage = 1; renderEstadisticas(); window.scrollTo({ top: 0 }); }
function pickStatsType(t) { statsType = t; statsGrade = ''; statsGradePage = 1; renderEstadisticas(); window.scrollTo({ top: 0 }); }
function closeStatsGrade() { statsGrade = ''; statsType = ''; renderEstadisticas(); window.scrollTo({ top: 0 }); }

// Lista paginada de fichas (40 por hoja) compartida por la página de un estado y la de un tipo
function renderCoinListPage(box, cfg) {
  const { list, kicker, titleHtml, emptyMsg, extraFor } = cfg;
  const pages = Math.max(1, Math.ceil(list.length / STATS_PAGE_SIZE));
  statsGradePage = Math.min(Math.max(1, statsGradePage), pages);
  const from = (statsGradePage - 1) * STATS_PAGE_SIZE;
  const cards = list.slice(from, from + STATS_PAGE_SIZE).map(c => renderCoinCard(c, { plain: true, extra: extraFor(c) })).join('');
  const navBtn = (label, target, disabled) => `<button ${disabled ? 'disabled' : `onclick="setStatsGradePage(${target})"`} class="xs-btn2">${label}</button>`;
  const pager = pages > 1 ? `
    <div class="xs-pager">
      ${navBtn('<i class="fa-solid fa-chevron-left mr-1"></i> Anterior', statsGradePage - 1, statsGradePage === 1)}
      <span class="xs-pager-mid">Hoja <b>${statsGradePage}</b> de ${pages}<br><span>${from + 1}–${Math.min(from + STATS_PAGE_SIZE, list.length)} de ${list.length} fichas</span></span>
      ${navBtn('Siguiente <i class="fa-solid fa-chevron-right ml-1"></i>', statsGradePage + 1, statsGradePage === pages)}
    </div>` : '';
  box.innerHTML = `
    <div class="flex items-center gap-3">
      <button onclick="closeStatsGrade()" class="xp-btn shrink-0" title="Volver a Estadísticas" aria-label="Volver a Estadísticas"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="min-w-0">
        <span class="xs-kicker block">${kicker}</span>
        <h3 class="xs-h2">${titleHtml}</h3>
      </div>
    </div>
    ${list.length ? `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 xs-cards">${cards}</div>${pager}` : `<div class="xp-empty-msg">${emptyMsg}</div>`}`;
  hydrateImages(box);
}

// Orden común: país, época y posición en el álbum
function sortCoinsForList(arr) {
  const cn = c => (countryById(c.countryId) || {}).name || '', pOrd = c => (periodById(c.periodId) || {}).order ?? 0;
  return arr.sort((a, b) => cn(a).localeCompare(cn(b), 'es', { sensitivity: 'base' }) || pOrd(a) - pOrd(b) || (a.order ?? 0) - (b.order ?? 0));
}

// Cabecera de cada tarjeta: bandera, país · época (y, si hace falta, un detalle)
function coinListHead(c, rightHtml, detail) {
  const co = countryById(c.countryId), p = periodById(c.periodId);
  return `<div class="w-full flex items-center gap-1.5 px-0.5 pb-0.5 min-w-0">${co ? flagChip(co, 18, 13) : ''}<span class="text-[10px] font-bold text-slate-300 truncate flex-1">${esc(co ? co.name : '')}${p ? ' · ' + esc(periodDisplayName(p)) : ''}</span>${rightHtml}</div>
      <div class="w-full text-[10px] text-amber-400 font-bold px-0.5 truncate">${detail}</div>`;
}

// Página de un estado: todas las fichas con algún ejemplar en ese estado, sin importar país ni época
function renderGradePage(box) {
  const byCoin = new Map();
  coins.forEach(c => (Array.isArray(c.items) ? c.items : []).forEach(it => {
    if (it && String(it.grade || '').trim() === statsGrade) { if (!byCoin.has(c)) byCoin.set(c, []); byCoin.get(c).push(it); }
  }));
  const list = sortCoinsForList([...byCoin.keys()]);
  const total = [...byCoin.values()].reduce((m, a) => m + a.length, 0);
  renderCoinListPage(box, {
    list, kicker: 'Estado de conservación',
    titleHtml: `${esc(statsGrade)} <span class="xs-dim">· ${list.length} ${list.length === 1 ? 'ficha' : 'fichas'} · ${total} ${total === 1 ? 'moneda' : 'monedas'}</span>`,
    emptyMsg: `No tienes ninguna moneda en estado ${esc(statsGrade)}.`,
    extraFor: c => { const its = byCoin.get(c); return coinListHead(c, its.length > 1 ? `<span class="text-[10px] font-black text-amber-400 shrink-0">×${its.length}</span>` : '', esc(its.map(i => i.year || 's/f').join(' · '))); }
  });
}

// Página de un tipo: todas las fichas de ese tipo (las tenga o no), sin importar país ni época
function renderTypePage(box) {
  const list = sortCoinsForList(coins.filter(c => coinType(c) === statsType));
  const have = list.filter(c => c.acquired).length;
  renderCoinListPage(box, {
    list, kicker: 'Tipo de moneda',
    titleHtml: `<span class="inline-block px-2 py-0.5 rounded-md text-sm font-black align-middle" style="${coinTypeChipStyle(statsType)}font-style:normal;">${esc(statsType)}</span> <span class="xs-dim">· ${list.length} ${list.length === 1 ? 'ficha' : 'fichas'} · ${have} ${have === 1 ? 'conseguida' : 'conseguidas'}</span>`,
    emptyMsg: `No hay fichas de tipo ${esc(statsType)}.`,
    extraFor: c => {
      const yrs = (c.items || []).filter(i => i && String(i.grade || '').trim()).map(i => i.year || 's/f');
      return coinListHead(c, '', yrs.length ? esc(yrs.join(' · ')) : '<span style="color:#94a3b8">Aún no la tengo</span>');
    }
  });
}
function toggleStatsRank() { statsRankAll = !statsRankAll; renderEstadisticas(); }
function resetStatsZoom() { statsRange = null; renderEstadisticas(); }

function renderEstadisticas() {
  const box = document.getElementById('estadisticas-content'); if (!box) return;
  if (statsGrade) { renderGradePage(box); return; }
  if (statsType) { renderTypePage(box); return; }
  const s = collectionStats();
  if (s.total === 0) { box.innerHTML = `<div class="xp-empty-msg">Aún no hay monedas en tu colección. Marca alguna con su estado para ver las estadísticas.</div>`; return; }
  const card = (icon, label, value, sub) => `
    <div class="xs-stat">
      <div class="xs-stat-label"><i class="fa-solid fa-${icon}"></i>${label}</div>
      <div class="xs-stat-value">${value}</div>
      <div class="xs-stat-sub">${sub}</div>
    </div>`;
  const srcTxt = { api: 'cotización actual', manual: 'precio manual', cache: 'última cotización', fallback: 'precio aproximado' }[silverPriceSource] || '';
  const rep = s.total - s.unique;
  const pct = x => x.t ? Math.round(x.a / x.t * 100) : 0;
  const bar = (label, x, cls) => `
    <div>
      <div class="xs-barlabel"><span>${label}</span><span><b>${pct(x)}%</b> · ${x.a} de ${x.t}</span></div>
      <div class="xs-track"><i class="${cls}" style="width:${pct(x)}%"></i></div>
    </div>`;
  const sec = (num, title, hint, inner) => `
    <section class="xs-sec">
      <div class="xp-head" style="cursor:default"><span class="xp-num">${num}</span><span class="xp-title" style="font-size:20px">${title}</span></div>
      ${hint ? `<p class="xs-hint">${hint}</p>` : ''}
      <div class="xs-panel">${inner}</div>
    </section>`;
  const rank = Object.entries(s.byCountry).map(([id, n]) => ({ c: countryById(id), n })).filter(x => x.c)
    .sort((a, b) => b.n - a.n || a.c.name.localeCompare(b.c.name, 'es', { sensitivity: 'base' }));
  const tile = g => `<button onclick="pickStatsGrade('${g}')" class="xs-tile ${statsGrade === g ? 'xs-on' : ''}">
      <div class="xs-tile-n">${s.grades[g] || 0}</div>
      <div class="xs-tile-l">${g}</div>
    </button>`;
  const typeRows = COIN_TYPES.filter(t => t !== DEFAULT_COIN_TYPE).map(t => {
    const all = coins.filter(c => coinType(c) === t), n = all.length, have = all.filter(c => c.acquired).length;
    return `<div class="xs-row">
      <span class="inline-block px-2 py-0.5 rounded-md text-[11px] font-black" style="${coinTypeChipStyle(t)}">${esc(t)}</span>
      <span class="flex items-center gap-2.5 shrink-0"><span class="xs-dim" style="font-size:11px">${have} conseguida${have === 1 ? '' : 's'}</span>
      <button ${n ? `onclick="pickStatsType('${jsArg(t)}')"` : 'disabled'} class="xs-count" title="${n ? 'Ver las fichas de este tipo' : 'Sin fichas'}">${n}</button></span>
    </div>`;
  }).join('');
  const nyName = x => (countryById(x.c.countryId) || {}).name || '', nyOrd = x => (periodById(x.c.periodId) || {}).order ?? 0;
  const noYearRows = Object.values(s.noYearBy)
    .sort((a, b) => nyName(a).localeCompare(nyName(b), 'es', { sensitivity: 'base' }) || nyOrd(a) - nyOrd(b) || (a.c.order ?? 0) - (b.c.order ?? 0))
    .map(x => {
      const co = countryById(x.c.countryId), p = periodById(x.c.periodId);
      return `<div onclick="openCoinModal('${jsArg(x.c.id)}')" class="xs-row" style="cursor:pointer">
        ${co ? flagChip(co, 24, 17) : ''}
        <div class="flex-1 min-w-0">
          <div class="flex justify-between gap-2"><span class="xs-name truncate">${esc(x.c.denom || '')}</span>${x.n > 1 ? `<span class="xs-num2 shrink-0">${x.n} sin año</span>` : ''}</div>
          <div class="xs-dim truncate" style="font-size:11px">${esc(co ? prettyName(co.name) : '')}${p ? ' · ' + esc(periodDisplayName(p)) : ''}</div>
        </div></div>`;
    }).join('');
  const shown = statsRankAll ? rank : rank.slice(0, 10), rmax = rank.length ? rank[0].n : 1;
  const rankHTML = shown.map((x, i) => `
    <div onclick="jumpToCountry('${jsArg(x.c.id)}')" class="flex items-center gap-2.5 cursor-pointer">
      <span class="xs-rank">${i + 1}</span>
      ${flagChip(x.c, 24, 17)}
      <div class="flex-1 min-w-0">
        <div class="flex justify-between gap-2"><span class="xs-name truncate">${esc(prettyName(x.c.name))}</span><span class="xs-num2 shrink-0">${x.n}</span></div>
        <div class="xs-track" style="height:6px;margin-top:5px"><i style="width:${Math.max(3, Math.round(x.n / rmax * 100))}%"></i></div>
      </div>
    </div>`).join('');
  box.innerHTML = `
    <div class="xs-grid">
      ${card('coins', 'Monedas', fmtN(s.total, 0), rep > 0 ? `incluye ${rep} ${rep === 1 ? 'repetida' : 'repetidas'}` : 'sin repetidas')}
      ${card('fingerprint', 'Únicas', fmtN(s.unique, 0), 'sin contar repetidas')}
      ${card('weight-hanging', 'Plata (peso)', `${fmtN(s.gross)} g`, `${s.silverCount} ${s.silverCount === 1 ? 'moneda' : 'monedas'} de plata · fina: ${fmtN(s.fine)} g`)}
      ${card('euro-sign', 'Plata (valor)', `${fmtN(s.eur)} €`, `${fmtN(currentSilverPricePerGram)} €/g · ${srcTxt}`)}
    </div>
    ${s.silverNoWeight ? `<p class="xs-warn"><i class="fa-solid fa-circle-info mr-1"></i>${s.silverNoWeight} ${s.silverNoWeight === 1 ? 'moneda de plata no tiene' : 'monedas de plata no tienen'} peso indicado y no se suma${s.silverNoWeight === 1 ? '' : 'n'}.</p>` : ''}
    ${sec('01', 'Progreso global', '', `<div class="space-y-3.5">${bar('Monedas', s.prog.n, '')}${s.prog.s.t ? bar('Monedas de plata', s.prog.s, 'silver-gradient-fill') : ''}</div>`)}
    ${sec('02', 'Estado de conservación', 'Toca un estado para ver todas las fichas que tienes en él.', `
      <div class="grid grid-cols-3 gap-2">${['UNC', 'AU', 'XF'].map(tile).join('')}</div>
      <div class="grid grid-cols-3 gap-2 mt-2">${['VF', 'F', 'TBD'].map(tile).join('')}</div>
      ${s.noGrade ? `<p class="xs-hint" style="margin-top:10px">${s.noGrade} ${s.noGrade === 1 ? 'ejemplar sin estado indicado' : 'ejemplares sin estado indicado'}.</p>` : ''}`)}
    ${sec('03', 'Tipo de moneda', 'Fichas de cada tipo (las circulantes no se cuentan). Toca la cantidad para verlas.', `<div class="space-y-2">${typeRows}</div>`)}
    ${sec('04', 'Monedas por año', `Arrastra sobre el gráfico para ampliar un período. ${statsRange ? 'Pulsa «Restablecer» (o clic derecho) para volver.' : ''}`, `
      ${statsRange ? `<div class="flex justify-end mb-1"><button onclick="resetStatsZoom()" class="xs-btn2"><i class="fa-solid fa-magnifying-glass-minus mr-1"></i>Restablecer</button></div>` : ''}
      ${statsChartHTML(s.byYear)}
      ${s.noYear ? `
        <button onclick="toggleNoYear()" class="xs-warn w-full flex items-center justify-between gap-2 text-left" style="margin-top:8px">
          <span><i class="fa-solid fa-triangle-exclamation mr-1"></i>${s.noYear} ${s.noYear === 1 ? 'moneda sin año' : 'monedas sin año'} (no ${s.noYear === 1 ? 'aparece' : 'aparecen'} en el gráfico)</span>
          <i class="fa-solid fa-chevron-${statsNoYearOpen ? 'up' : 'down'} text-[10px]"></i>
        </button>
        ${statsNoYearOpen ? `<div class="space-y-1.5" style="margin-top:8px">${noYearRows}</div>` : ''}` : ''}`)}
    ${sec('05', 'Ranking de países', `${statsRankAll ? `Todos (${rank.length})` : `Top ${Math.min(10, rank.length)}`} · monedas`, `
      <div class="space-y-3">${rankHTML}</div>
      ${rank.length > 10 ? `<button onclick="toggleStatsRank()" class="xs-btn2 w-full" style="margin-top:14px"><i class="fa-solid fa-chevron-${statsRankAll ? 'up' : 'down'} mr-1"></i>${statsRankAll ? 'Ver solo el top 10' : `Ver todos los países (${rank.length})`}</button>` : ''}`)}`;
  attachStatsChart();
}
