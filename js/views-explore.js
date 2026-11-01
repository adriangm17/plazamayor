/* ===== VISTA EXPLORAR: zonas geográficas (propias y predefinidas) ===== */
const BUILTIN_ZONES = ['Europa', 'América', 'Asia', 'África', 'Oceanía'];
const UNCLASSIFIED = 'Sin clasificar';
const CONTINENT_ICON = { 'Europa': 'earth-europe', 'América': 'earth-americas', 'Asia': 'earth-asia', 'África': 'earth-africa', 'Oceanía': 'earth-oceania', [UNCLASSIFIED]: 'circle-question' };

const CONTINENT_COUNTRIES = {
  'Europa': 'espana,portugal,francia,italia,alemania,austria,suiza,belgica,paises bajos,holanda,luxemburgo,reino unido,gran bretana,inglaterra,escocia,irlanda,islandia,noruega,suecia,finlandia,dinamarca,polonia,chequia,republica checa,checoslovaquia,eslovaquia,hungria,rumania,bulgaria,grecia,albania,yugoslavia,serbia,croacia,eslovenia,bosnia,montenegro,macedonia,kosovo,moldavia,ucrania,bielorrusia,rusia,urss,estonia,letonia,lituania,malta,chipre,andorra,monaco,san marino,vaticano,liechtenstein,gibraltar,rda,union sovietica,prusia,imperio ruso,imperio austrohungaro,sacro imperio romano,imperio romano',
  'América': 'estados unidos,eeuu,usa,canada,mexico,guatemala,belice,honduras,el salvador,nicaragua,costa rica,panama,cuba,haiti,republica dominicana,jamaica,bahamas,barbados,trinidad y tobago,puerto rico,colombia,venezuela,ecuador,peru,bolivia,chile,argentina,uruguay,paraguay,brasil,guyana,surinam,groenlandia,caribe oriental',
  'Asia': 'china,japon,corea,india,pakistan,banglades,sri lanka,nepal,butan,birmania,myanmar,tailandia,vietnam,laos,camboya,malasia,singapur,indonesia,filipinas,brunei,taiwan,hong kong,macao,mongolia,kazajistan,uzbekistan,turkmenistan,kirguistan,tayikistan,afganistan,iran,irak,siria,libano,israel,jordania,arabia saudi,arabia saudita,yemen,oman,emiratos arabes,catar,qatar,bahrein,kuwait,turquia,georgia,armenia,azerbaiyan,maldivas,palestina',
  'África': 'egipto,libia,tunez,argelia,marruecos,sudan,etiopia,eritrea,somalia,yibuti,kenia,uganda,tanzania,ruanda,burundi,congo,zaire,angola,zambia,zimbabue,rodesia,mozambique,malaui,madagascar,mauricio,seychelles,namibia,botsuana,sudafrica,suazilandia,esuatini,lesoto,nigeria,ghana,costa de marfil,senegal,mali,niger,chad,camerun,gabon,guinea,sierra leona,liberia,togo,benin,burkina faso,mauritania,gambia,cabo verde,santo tome,comoras,centroafricana,sahara',
  'Oceanía': 'australia,nueva zelanda,papua nueva guinea,papua,fiyi,samoa,tonga,vanuatu,islas salomon,kiribati,tuvalu,nauru,palaos'
};

function normKey(s) { return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }

// Lista (clave → continente) ordenada de más larga a más corta, para que "guinea ecuatorial" gane a "guinea"
const CONTINENT_KEYS = Object.entries(CONTINENT_COUNTRIES)
  .flatMap(([cont, list]) => list.split(',').map(k => [k, cont]))
  .sort((a, b) => b[0].length - a[0].length);
const _autoContinentCache = {};

function autoContinent(name) {
  const n = normKey(name);
  if (_autoContinentCache[n] !== undefined) return _autoContinentCache[n];
  let found = UNCLASSIFIED;
  for (const [key, cont] of CONTINENT_KEYS) {
    if (new RegExp('(^|[^a-z])' + key + '([^a-z]|$)').test(n)) { found = cont; break; }
  }
  return (_autoContinentCache[n] = found);
}

/* ----- Zonas propias: se guardan en localStorage y en la copia de seguridad.
   Además, cualquier zona que use algún país se recupera sola aunque la lista se pierda. ----- */
let customZones = (() => {
  try { const a = JSON.parse(localStorage.getItem('numis_custom_zones') || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()) : []; }
  catch (e) { return []; }
})();
function saveCustomZones() { try { localStorage.setItem('numis_custom_zones', JSON.stringify(customZones)); } catch (e) {} }

/* Orden de las zonas en Explorar (se cambia manteniendo pulsada una zona y arrastrándola) */
let zoneOrder = (() => {
  try { const a = JSON.parse(localStorage.getItem('numis_zone_order') || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()) : []; }
  catch (e) { return []; }
})();
function saveZoneOrder() { try { localStorage.setItem('numis_zone_order', JSON.stringify(zoneOrder)); } catch (e) {} }
function applyZoneOrder(list) {
  const idx = k => { const i = zoneOrder.indexOf(k); return i < 0 ? Infinity : i; };
  return list.map((k, n) => [k, n]).sort((a, b) => (idx(a[0]) - idx(b[0])) || (a[1] - b[1])).map(x => x[0]);
}

function allZones() {
  const z = [...BUILTIN_ZONES, ...customZones.filter(n => !BUILTIN_ZONES.includes(n))];
  countries.forEach(c => { if (c.continent && !z.includes(c.continent)) z.push(c.continent); });
  return z;
}

function continentOf(country) {
  return (country.continent && allZones().includes(country.continent)) ? country.continent : autoContinent(country.name);
}

function cleanZoneName(raw, ignore) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!name) return null;
  if (name.length > 40) { alert('El nombre es demasiado largo (máximo 40 caracteres).'); return null; }
  const k = normKey(name);
  if (k === normKey(UNCLASSIFIED) || allZones().some(z => z !== ignore && normKey(z) === k)) { alert('Ya existe una zona con ese nombre.'); return null; }
  return name;
}

function addZone() {
  const input = document.getElementById('new-zone-name');
  const name = cleanZoneName(input.value);
  if (!name) return;
  customZones.push(name);
  saveCustomZones();
  input.value = '';
  toggleAddZoneRow();
  // La zona nueva sale al final de la lista: se abre su selector de países y se baja hasta ella
  exploreClosed[name] = false;
  exploreAddZone = name;
  renderExplorar();
  const card = [...document.querySelectorAll('[data-zone]')].find(el => el.dataset.zone === name);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('ring-2', 'ring-amber-500');
    setTimeout(() => card.classList.remove('ring-2', 'ring-amber-500'), 1800);
  }
}

function renameZone(oldName) {
  const name = cleanZoneName(prompt('Nuevo nombre de la zona:', oldName), oldName);
  if (!name || name === oldName) return;
  const i = customZones.indexOf(oldName);
  if (i >= 0) customZones[i] = name; else customZones.push(name);
  countries.forEach(c => { if (c.continent === oldName) c.continent = name; });
  saveCustomZones();
  persistMeta();
  renderExplorar();
}

function deleteZone(name) {
  const n = countries.filter(c => c.continent === name).length;
  if (!confirm(`¿Eliminar la zona "${name}"?` + (n ? ` Sus ${n} ${n === 1 ? 'país volverá' : 'países volverán'} a la clasificación automática.` : ''))) return;
  customZones = customZones.filter(z => z !== name);
  countries.forEach(c => { if (c.continent === name) delete c.continent; });
  saveCustomZones();
  persistMeta();
  renderExplorar();
}

function setCountryContinent(countryId, value) {
  const c = countryById(countryId);
  if (!c) return;
  if (value) c.continent = value; else delete c.continent;
  persistMeta();
  renderExplorar();
}

// Rellena el desplegable de zona de la ventana "Editar país"
function fillZoneSelect(selected) {
  const sel = document.getElementById('input-edit-country-continent');
  sel.innerHTML = '<option value="">Automático</option>' + allZones().map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('');
  sel.value = selected || '';
}

let exploreAddZone = '';   // zona cuyo selector de países está abierto
let exploreSearch = '';
const exploreClosed = {};
const CARD_DOTS = 5;       // bolitas de progreso de cada tarjeta (cada una = 20 %)

function expandAllZones() { Object.keys(exploreClosed).forEach(k => delete exploreClosed[k]); renderExplorar(); }
function collapseAllZones() { [...allZones(), UNCLASSIFIED].forEach(k => { exploreClosed[k] = true; }); renderExplorar(); }
function toggleAddCountry(zone) {
  exploreAddZone = (exploreAddZone === zone) ? '' : zone;
  if (exploreAddZone) exploreClosed[zone] = false;
  renderExplorar();
}
function addCountryToZone(countryId, zone) {
  exploreAddZone = '';
  setCountryContinent(countryId, zone);
}
function toggleExploreContinent(c) { exploreClosed[c] = !exploreClosed[c]; renderExplorar(); }

function toggleAddZoneRow() {
  const row = document.getElementById('xp-addzone'), btn = document.getElementById('xp-btn-addzone');
  if (!row) return;
  const open = row.classList.toggle('xp-open');
  if (btn) btn.classList.toggle('xp-on', open);
  if (open) { const i = document.getElementById('new-zone-name'); if (i) i.focus(); }
}

function onExploreSearch(value) { exploreSearch = value; renderExplorar(); }

function countryStats(c) {
  const normal = coinsOfCountry(c.id).filter(x => !isSilverCoin(x));
  const a = normal.filter(x => x.acquired).length;
  return { a, t: normal.length, pct: normal.length ? Math.round(a / normal.length * 100) : 0 };
}

// "SURINAM" → "Surinam"; los nombres que ya vienen en minúsculas/mixtas se respetan
function prettyName(s) {
  s = String(s ?? '').trim();
  if (!s || s !== s.toUpperCase() || s === s.toLowerCase()) return s;
  const small = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'en']);
  return s.toLowerCase().split(' ').map((w, i) => (i && small.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Moneda de la tarjeta: imagen propia > moneda elegida > una del país con foto (mejor si ya la tienes)
function cardCoinSource(c) {
  if (typeof c.coinImage === 'string' && c.coinImage.startsWith('data:image/')) return { src: c.coinImage };
  const list = coinsOfCountry(c.id).filter(x => x.hasFront);
  const chosen = c.coinId && list.find(x => x.id === c.coinId);
  const pick = chosen || list.find(x => x.acquired) || list[0];
  return pick ? { coinId: pick.id } : null;
}

function cardCoinHtml(c) {
  const src = cardCoinSource(c);
  if (!src) return `<div class="xp-coin xp-nocoin" title="Sin imagen de moneda"><i class="fa-solid fa-coins"></i></div>`;
  return `<div class="xp-coin">${src.src ? `<img src="${esc(src.src)}" alt="">` : imgTag(src.coinId, 'front')}</div>`;
}

function editCountryCard(countryId) { currentCountryId = countryId; openEditCountryModal(); }

function countryCardHtml(c) {
  const s = countryStats(c);
  // Cada bolita vale 20 %: se redondea, con al menos una si hay algo y las cinco solo al 100 %
  const filled = s.pct <= 0 ? 0 : (s.pct >= 100 ? CARD_DOTS : Math.min(CARD_DOTS - 1, Math.max(1, Math.round(s.pct / 100 * CARD_DOTS))));
  const dots = Array.from({ length: CARD_DOTS }, (_, i) => `<i class="${i < filled ? 'xp-f' : ''}"></i>`).join('');
  const name = prettyName(c.name);
  const photo = (typeof c.photo === 'string' && c.photo.startsWith('data:image/')) ? c.photo : '';
  const id = jsArg(c.id);
  return `
    <div class="xp-card" onclick="jumpToCountry('${id}')" role="button" tabindex="0" aria-label="${esc(name)}: ${s.a} de ${s.t} monedas"><div class="xp-in">
      <div class="xp-photo ${photo ? '' : 'xp-empty'}" ${photo ? `style="background-image:url('${esc(photo)}')"` : ''}>
        <span class="xp-flag" style="background:${flagLayers(c).replace(/"/g, '&quot;')}"></span>
        <button type="button" class="xp-edit" onclick="event.stopPropagation(); editCountryCard('${id}')" title="Editar foto, moneda y bandera" aria-label="Editar tarjeta de ${esc(name)}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
        </button>
      </div>
      <div class="xp-dots" title="${s.pct}% completado" aria-hidden="true">${dots}</div>
      <div class="xp-circle"></div>
      ${cardCoinHtml(c)}
      <div class="xp-name ${name.length > 15 ? 'xp-long' : (name.length > 10 ? 'xp-mid' : '')}">${esc(name)}</div>
    </div></div>`;
}

function renderExplorar() {
  const box = document.getElementById('explorar-content');
  if (!box) return;
  if (countries.length === 0) { box.innerHTML = `<div class="xp-empty-msg">Aún no hay países en la colección.</div>`; return; }
  box.innerHTML = renderContinents();
  hydrateImages(box);
}

function renderContinents() {
  const zones = allZones();
  const groups = {};
  sortedCountries().forEach(c => { (groups[continentOf(c)] ||= []).push(c); });
  // Las zonas predefinidas vacías no se muestran; las propias sí, para poder llenarlas
  const order = applyZoneOrder([...zones, UNCLASSIFIED].filter(k => groups[k] || !BUILTIN_ZONES.includes(k) && k !== UNCLASSIFIED));

  const q = normKey(exploreSearch);
  let shown = 0;
  const html = order.map((cont, idx) => {
    const all = (groups[cont] || []).map(c => ({ c, s: countryStats(c) }));
    let list = all;
    if (q) {
      const zoneHit = normKey(cont).includes(q);
      if (!zoneHit) list = all.filter(({ c }) => normKey(c.name).includes(q) || periodsOfCountry(c.id).some(p => normKey(p.name).includes(q)));
      if (list.length === 0) return '';
    }
    shown++;
    const a = all.reduce((m, x) => m + x.s.a, 0), t = all.reduce((m, x) => m + x.s.t, 0);
    const pct = t ? Math.round(a / t * 100) : 0;
    const closed = !q && exploreClosed[cont];
    const isBuiltin = BUILTIN_ZONES.includes(cont), isUncl = cont === UNCLASSIFIED;
    const others = [...countries].sort((x, y) => x.name.localeCompare(y.name, 'es', { sensitivity: 'base' })).filter(c => continentOf(c) !== cont);
    const num = String(idx + 1).padStart(2, '0');
    const zid = jsArg(cont);
    const n = all.length;
    return `
      <section data-zone="${esc(cont)}" class="xp-zone">
        <div class="xp-head" onpointerdown="zoneDragStart(event)" onclick="toggleExploreContinent('${zid}')" role="button" aria-expanded="${!closed}" aria-label="${esc(cont)}">
          <span class="xp-num">${num}</span>
          <span class="xp-title">${esc(cont)}</span>
          ${(!isBuiltin && !isUncl) ? `
            <button type="button" class="xp-mini" onclick="event.stopPropagation(); renameZone('${zid}')" title="Renombrar zona" aria-label="Renombrar zona"><i class="fa-solid fa-pen text-[11px]"></i></button>
            <button type="button" class="xp-mini" onclick="event.stopPropagation(); deleteZone('${zid}')" title="Eliminar zona" aria-label="Eliminar zona"><i class="fa-solid fa-trash text-[11px]"></i></button>` : ''}
          <span class="xp-count">${n} ${n === 1 ? 'País' : 'Países'}</span>
        </div>
        <div class="xp-bar" title="${a} de ${t} monedas (${pct}%)"><i style="width:${pct}%"></i></div>
        ${isUncl && n ? `<p class="xp-note">Pulsa el lápiz de cada país para asignarle una zona.</p>` : ''}
        ${exploreAddZone === cont ? `
          <div class="xp-picker">
            <p>Añadir a ${esc(cont)}</p>
            <div class="xp-list">
              ${others.length === 0 ? `<button type="button" disabled>No hay más países para añadir.</button>` : others.map(c => `
                <button type="button" onclick="addCountryToZone('${jsArg(c.id)}', '${zid}')"><span class="flex items-center gap-2">${flagChip(c, 22, 15)}${esc(prettyName(c.name))}</span><small>${esc(continentOf(c))}</small></button>`).join('')}
            </div>
          </div>` : ''}
        ${closed ? '' : `
          <div class="xp-row">
            ${list.map(({ c }) => countryCardHtml(c)).join('')}
            ${(!q && !isUncl) ? `<button type="button" class="xp-add ${exploreAddZone === cont ? 'xp-on' : ''}" onclick="toggleAddCountry('${zid}')" aria-label="Añadir un país a ${esc(cont)}">
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Añadir país</button>` : ''}
          </div>`}
      </section>`;
  }).join('');
  if (q && shown === 0) return `<div class="xp-empty-msg">Nada coincide con «${esc(exploreSearch.trim())}».</div>`;
  return html;
}

/* ----- Reordenar zonas: mantener pulsado y arrastrar arriba/abajo ----- */
const ZONE_HOLD_MS = 450;
let zoneDrag = null;       // { card, pointerId, startX, startY, y, timer, active, scrollRaf }
let zoneDragSuppressClick = false;

function zoneDragStart(e) {
  if (zoneDrag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  if (e.target.closest('button, select, input, a, [data-nodrag]')) return;
  const card = e.currentTarget.closest('[data-zone]');
  if (!card) return;
  zoneDrag = { card, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, y: e.clientY, active: false, scrollRaf: 0 };
  zoneDrag.timer = setTimeout(zoneDragActivate, ZONE_HOLD_MS);
  window.addEventListener('pointermove', zoneDragMove);
  window.addEventListener('pointerup', zoneDragEnd);
  window.addEventListener('pointercancel', zoneDragEnd);
  window.addEventListener('touchmove', zoneBlockScroll, { passive: false });
  window.addEventListener('contextmenu', zoneBlockMenu);
}

function zoneBlockScroll(e) { if (zoneDrag && zoneDrag.active && e.cancelable) e.preventDefault(); }
function zoneBlockMenu(e) { if (zoneDrag) e.preventDefault(); }

function zoneDragActivate() {
  if (!zoneDrag) return;
  const d = zoneDrag;
  d.active = true;
  d.card.style.transition = 'none';
  d.card.style.position = 'relative';
  d.card.style.zIndex = '40';
  d.card.style.transform = 'scale(1.02)';
  d.card.style.boxShadow = '0 14px 34px rgba(61,26,84,0.40)';
  d.card.classList.add('xp-dragging');
  d.card.style.touchAction = 'none';
  try { d.card.setPointerCapture(d.pointerId); } catch (err) {}
  if (navigator.vibrate) { try { navigator.vibrate(15); } catch (err) {} }
  d.scrollRaf = requestAnimationFrame(zoneAutoScroll);
}

function zoneDragMove(e) {
  const d = zoneDrag;
  if (!d || e.pointerId !== d.pointerId) return;
  d.y = e.clientY;
  if (!d.active) {
    // Si se mueve antes de tiempo, es un scroll normal: se cancela la pulsación larga
    if (Math.abs(e.clientX - d.startX) > 8 || Math.abs(e.clientY - d.startY) > 8) zoneDragCleanup();
    return;
  }
  e.preventDefault();
  zoneDragPlace();
}

// Coloca la tarjeta bajo el dedo y la intercambia con las vecinas al cruzar su mitad
function zoneDragPlace() {
  const d = zoneDrag;
  if (!d || !d.active) return;
  const card = d.card;
  const apply = () => { card.style.transform = `translateY(${d.y - d.startY}px) scale(1.02)`; };
  apply();
  for (let guard = 0; guard < 6; guard++) {
    const r = card.getBoundingClientRect();
    const center = r.top + r.height / 2;
    const prev = card.previousElementSibling, next = card.nextElementSibling;
    let target = null, before = false;
    if (prev && prev.dataset.zone !== undefined) {
      const pr = prev.getBoundingClientRect();
      if (center < pr.top + pr.height / 2) { target = prev; before = true; }
    }
    if (!target && next && next.dataset.zone !== undefined) {
      const nr = next.getBoundingClientRect();
      if (center > nr.top + nr.height / 2) { target = next; before = false; }
    }
    if (!target) break;
    const visualTop = r.top;
    if (before) target.before(card); else target.after(card);
    // Se mide la nueva posición natural y se corrige el desplazamiento para que no salte
    card.style.transform = 'scale(1.02)';
    const natural = card.getBoundingClientRect().top;
    d.startY = d.y - (visualTop - natural);
    apply();
  }
}

function zoneAutoScroll() {
  const d = zoneDrag;
  if (!d || !d.active) return;
  const edge = 90, vh = window.innerHeight;
  let step = 0;
  if (d.y < edge) step = -Math.ceil((edge - d.y) / 6);
  else if (d.y > vh - edge) step = Math.ceil((d.y - (vh - edge)) / 6);
  if (step) {
    const before = window.scrollY;
    window.scrollBy(0, step);
    const moved = window.scrollY - before;
    if (moved) { d.startY -= moved; zoneDragPlace(); }
  }
  d.scrollRaf = requestAnimationFrame(zoneAutoScroll);
}

function zoneDragEnd(e) {
  const d = zoneDrag;
  if (!d || (e && e.pointerId !== d.pointerId)) return;
  const wasActive = d.active;
  zoneDragCleanup();
  if (!wasActive) return;
  zoneDragSuppressClick = true;
  setTimeout(() => { zoneDragSuppressClick = false; }, 350);
  const names = [...document.querySelectorAll('#explorar-content [data-zone]')].map(el => el.dataset.zone);
  zoneOrder = names;
  saveZoneOrder();
  renderExplorar();
}

function zoneDragCleanup() {
  const d = zoneDrag;
  if (!d) return;
  clearTimeout(d.timer);
  cancelAnimationFrame(d.scrollRaf);
  if (d.active) {
    const s = d.card.style;
    s.transition = s.position = s.zIndex = s.transform = s.boxShadow = s.touchAction = '';
    d.card.classList.remove('xp-dragging');
    try { d.card.releasePointerCapture(d.pointerId); } catch (err) {}
  }
  window.removeEventListener('pointermove', zoneDragMove);
  window.removeEventListener('pointerup', zoneDragEnd);
  window.removeEventListener('pointercancel', zoneDragEnd);
  window.removeEventListener('touchmove', zoneBlockScroll);
  window.removeEventListener('contextmenu', zoneBlockMenu);
  zoneDrag = null;
}

// Tras soltar una zona arrastrada no debe contar como pulsación (evita plegarla/desplegarla)
window.addEventListener('click', e => {
  if (zoneDragSuppressClick) { e.stopPropagation(); e.preventDefault(); }
}, true);

/* ----- Desplazamiento lateral de las filas de países (zona geográfica) -----
   Con el dedo ya es nativo. Con ratón se arrastra la fila (y la rueda con Mayús o el trackpad también sirven). */
let rowDrag = null;
let rowDragSuppressClick = false;

window.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  const row = e.target.closest && e.target.closest('.xp-row');
  if (!row || row.scrollWidth <= row.clientWidth + 1) return;
  if (e.target.closest('button, input, select, a')) return;
  rowDrag = { row, startX: e.clientX, startLeft: row.scrollLeft, moved: false };
});

window.addEventListener('pointermove', e => {
  const d = rowDrag;
  if (!d || e.pointerType !== 'mouse') return;
  const dx = e.clientX - d.startX;
  if (!d.moved) {
    if (Math.abs(dx) < 6) return;
    d.moved = true;
    d.row.classList.add('xp-grabbing');
  }
  d.row.scrollLeft = d.startLeft - dx;
  e.preventDefault();
});

function endRowDrag() {
  const d = rowDrag;
  if (!d) return;
  rowDrag = null;
  d.row.classList.remove('xp-grabbing');
  if (d.moved) {
    // Soltar tras arrastrar no debe abrir la tarjeta sobre la que se acaba
    rowDragSuppressClick = true;
    setTimeout(() => { rowDragSuppressClick = false; }, 60);
  }
}
window.addEventListener('pointerup', endRowDrag);
window.addEventListener('pointercancel', endRowDrag);
window.addEventListener('click', e => {
  if (rowDragSuppressClick) { e.stopPropagation(); e.preventDefault(); }
}, true);
// Evita que arrastrar la imagen de una moneda inicie el arrastre nativo del navegador
window.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.xp-row')) e.preventDefault(); });
