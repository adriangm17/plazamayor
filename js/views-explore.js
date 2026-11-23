/* ===== VISTA EXPLORAR: zonas geográficas (propias y predefinidas) ===== */
const BUILTIN_ZONES = ['Europa', 'América', 'Asia', 'África', 'Oceanía'];
const UNCLASSIFIED = 'Sin clasificar';
const CONTINENT_ICON = { 'Europa': 'earth-europe', 'América': 'earth-americas', 'Asia': 'earth-asia', 'África': 'earth-africa', 'Oceanía': 'earth-oceania', [UNCLASSIFIED]: 'circle-question' };

const CONTINENT_COUNTRIES = {
  'Europa': 'espana,portugal,francia,italia,alemania,austria,suiza,belgica,paises bajos,holanda,luxemburgo,reino unido,gran bretana,inglaterra,escocia,irlanda,islandia,noruega,suecia,finlandia,dinamarca,polonia,chequia,republica checa,checoslovaquia,eslovaquia,hungria,rumania,bulgaria,grecia,albania,yugoslavia,serbia,croacia,eslovenia,bosnia,montenegro,macedonia,kosovo,moldavia,ucrania,bielorrusia,rusia,urss,estonia,letonia,lituania,malta,chipre,andorra,monaco,san marino,vaticano,liechtenstein,gibraltar,rda,union sovietica,prusia,imperio ruso,imperio austrohungaro,sacro imperio romano,imperio romano',
  'América': 'estados unidos,eeuu,usa,canada,mexico,guatemala,belice,honduras,el salvador,nicaragua,costa rica,panama,cuba,haiti,republica dominicana,jamaica,bahamas,barbados,trinidad y tobago,puerto rico,colombia,venezuela,ecuador,peru,bolivia,chile,argentina,uruguay,paraguay,brasil,guyana,surinam,groenlandia,caribe oriental',
  'Asia': 'china,japon,corea,india,pakistan,banglades,sri lanka,nepal,butan,birmania,myanmar,tailandia,vietnam,laos,camboya,malasia,singapur,indonesia,filipinas,brunei,taiwan,hong kong,macao,mongolia,kazajistan,uzbekistan,turkmenistan,kirguistan,tayikistan,afganistan,iran,irak,siria,libano,israel,jordania,arabia saudi,arabia saudita,yemen,oman,emiratos arabes,catar,qatar,bahrein,kuwait,turquia,georgia,armenia,azerbaiyan,maldivas,palestina',
  'África': 'africa central,beac,cemac,africa occidental,bceao,uemoa,egipto,libia,tunez,argelia,marruecos,sudan,etiopia,eritrea,somalia,yibuti,kenia,uganda,tanzania,ruanda,burundi,congo,zaire,angola,zambia,zimbabue,rodesia,mozambique,malaui,madagascar,mauricio,seychelles,namibia,botsuana,sudafrica,suazilandia,esuatini,lesoto,nigeria,ghana,costa de marfil,senegal,mali,niger,chad,camerun,gabon,guinea,sierra leona,liberia,togo,benin,burkina faso,mauritania,gambia,cabo verde,santo tome,comoras,centroafricana,sahara',
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
/* v8.50: los cambios de zonas (orden, zonas propias, continentes) solo tocaban localStorage y no avisaban a la sincronización: ahora la marcan para subir */
function zonesToCloud() { try { if (window.PMSync && PMSync.touch) PMSync.touch(); } catch (e) {} }
function saveCustomZones() { try { localStorage.setItem('numis_custom_zones', JSON.stringify(customZones)); } catch (e) {} zonesToCloud(); }

/* Orden de las zonas en Explorar (se cambia manteniendo pulsada una zona y arrastrándola) */
let zoneOrder = (() => {
  try { const a = JSON.parse(localStorage.getItem('numis_zone_order') || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()) : []; }
  catch (e) { return []; }
})();
function saveZoneOrder() { try { localStorage.setItem('numis_zone_order', JSON.stringify(zoneOrder)); } catch (e) {} zonesToCloud(); }
function applyZoneOrder(list) {
  const idx = k => { const i = zoneOrder.indexOf(k); return i < 0 ? Infinity : i; };
  return list.map((k, n) => [k, n]).sort((a, b) => (idx(a[0]) - idx(b[0])) || (a[1] - b[1])).map(x => x[0]);
}

/* ----- Continente de cada zona (para los 6 botones de arriba) -----
   Se elige en "Editar zona". Si no se ha elegido: por el nombre de la zona (Europa del Este → Europa)
   o, si no, por el continente en el que caen la mayoría de sus países. */
const CONTINENTS = ['Europa', 'América', 'Asia', 'África', 'Oceanía', 'Extintos'];
const CONTINENT_BTN_ICON = { 'Europa': 'earth-europe', 'América': 'earth-americas', 'Asia': 'earth-asia', 'África': 'earth-africa', 'Oceanía': 'earth-oceania', 'Extintos': 'landmark-dome' };
let zoneContinents = (() => {
  try { const o = JSON.parse(localStorage.getItem('numis_zone_continents') || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; }
  catch (e) { return {}; }
})();
function saveZoneContinents() { try { localStorage.setItem('numis_zone_continents', JSON.stringify(zoneContinents)); } catch (e) {} zonesToCloud(); }

function zoneContinent(zone) {
  const ex = zoneContinents[zone];
  if (CONTINENTS.includes(ex)) return ex;
  if (CONTINENTS.includes(zone)) return zone;   // las zonas predefinidas son su propio continente
  const n = normKey(zone);
  if (/extint|desaparecid|historic/.test(n)) return 'Extintos';
  if (/europ/.test(n)) return 'Europa';
  if (/americ|caribe|amazon|andin/.test(n)) return 'América';
  if (/afric/.test(n)) return 'África';
  if (/oceani|pacifico/.test(n)) return 'Oceanía';
  if (/asia|oriente|medio oriente|arabi|caucaso/.test(n)) return 'Asia';
  // por mayoría de sus países
  const votes = {};
  countries.forEach(c => { if (c.continent === zone) { const k = autoContinent(c.name); if (CONTINENTS.includes(k)) votes[k] = (votes[k] || 0) + 1; } });
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : '';
}

let exploreContinent = '';   // continente filtrado ('' = todos)
/* v9.03: Explorar tiene dos vistas: 'jukebox' (una ficha de pasaporte por país, deslizable) y 'zonas' (la cartelera de filas por zona de antes) */
let exploreView = (() => { try { return localStorage.getItem('numis_explore_view') === 'zonas' ? 'zonas' : 'jukebox'; } catch (e) { return 'jukebox'; } })();
let exploreZone = '';        // zona elegida en la tira de chips ('' = todas)
let exploreJukeId = '';      // país que está a la vista en el jukebox (para volver al mismo con «atrás»)
function toggleExploreView() {
  exploreView = exploreView === 'jukebox' ? 'zonas' : 'jukebox';
  try { localStorage.setItem('numis_explore_view', exploreView); } catch (e) {}
  renderExplorar();
}
function setExploreContinent(c) {
  exploreContinent = (exploreContinent === c) ? '' : c;
  exploreZone = '';
  renderExplorar();
  if (typeof navSync === 'function') navSync();   // v8.29: el continente elegido queda en el historial (así "atrás" desde un país vuelve a él)
}
function syncContinentButtons() {
  document.querySelectorAll('#xp-conts .xp-cont').forEach(b => {
    const on = b.dataset.cont === exploreContinent;
    b.classList.toggle('xp-on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function continentOptionsHtml(selected) {
  return '<option value="">Automático</option>' + CONTINENTS.map(c => `<option value="${esc(c)}"${c === selected ? ' selected' : ''}>${esc(c)}</option>`).join('');
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
  const sel = document.getElementById('new-zone-continent');
  const cont = (sel && sel.value) || '';
  if (cont) zoneContinents[name] = cont;
  else if (exploreContinent && zoneContinent(name) !== exploreContinent) zoneContinents[name] = exploreContinent;   // con un filtro activo, la zona nueva se queda visible
  saveZoneContinents();
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

/* ----- Menú de la zona: renombrar o eliminar ----- */
function openEditZoneModal(name) {
  document.getElementById('input-edit-zone-old').value = name;
  document.getElementById('input-edit-zone-name').value = name;
  document.getElementById('input-edit-zone-continent').innerHTML = continentOptionsHtml(CONTINENTS.includes(zoneContinents[name]) ? zoneContinents[name] : '');
  document.getElementById('edit-zone-modal').classList.remove('hidden');
  setTimeout(() => { const i = document.getElementById('input-edit-zone-name'); if (i) { i.focus(); i.select(); } }, 50);
}
function closeEditZoneModal() {
  document.getElementById('edit-zone-modal').classList.add('hidden');
}
function saveEditedZone() {
  const oldName = document.getElementById('input-edit-zone-old').value;
  const name = cleanZoneName(document.getElementById('input-edit-zone-name').value, oldName);
  if (!name) return;
  const cont = document.getElementById('input-edit-zone-continent').value;
  closeEditZoneModal();
  if (cont) zoneContinents[oldName] = cont; else delete zoneContinents[oldName];
  saveZoneContinents();
  renameZone(oldName, name);   // (también traslada el continente al nuevo nombre y repinta)
}
function deleteZoneFromModal() {
  const name = document.getElementById('input-edit-zone-old').value;
  if (deleteZone(name)) closeEditZoneModal();
}

function renameZone(oldName, name) {
  if (!name) return;
  if (name === oldName) { renderExplorar(); return; }
  if (zoneContinents[oldName]) { zoneContinents[name] = zoneContinents[oldName]; delete zoneContinents[oldName]; saveZoneContinents(); }
  const i = customZones.indexOf(oldName);
  if (i >= 0) customZones[i] = name; else customZones.push(name);
  countries.forEach(c => { if (c.continent === oldName) c.continent = name; });
  saveCustomZones();
  persistMeta();
  renderExplorar();
}

function deleteZone(name) {
  const n = countries.filter(c => c.continent === name).length;
  if (!confirm(`¿Eliminar la zona "${name}"?` + (n ? ` Sus ${n} ${n === 1 ? 'país volverá' : 'países volverán'} a la clasificación automática.` : ''))) return false;
  customZones = customZones.filter(z => z !== name);
  delete zoneContinents[name]; saveZoneContinents();
  countries.forEach(c => { if (c.continent === name) delete c.continent; });
  saveCustomZones();
  persistMeta();
  renderExplorar();
  return true;
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

// v8.10: un solo botón. Si alguna zona está desplegada, contrae todas; si están todas contraídas, las despliega
function toggleAllZones() {
  if ([...allZones(), UNCLASSIFIED].some(k => !exploreClosed[k])) collapseAllZones(); else expandAllZones();
}
function updateExploreToggle() {
  const vb = document.getElementById('explorar-view');
  if (vb) { const j = exploreView === 'jukebox'; vb.innerHTML = `<i class="fa-solid fa-${j ? 'table-list' : 'clone'}"></i>`; vb.title = vb.ariaLabel = j ? 'Ver por zonas (lista)' : 'Ver como pasaporte (una ficha por país)'; }
  const btn = document.getElementById('explorar-toggle'); if (!btn) return;
  btn.style.display = exploreView === 'jukebox' ? 'none' : '';
  const anyOpen = [...allZones(), UNCLASSIFIED].some(k => !exploreClosed[k]);
  const t = anyOpen ? 'Contraer todo' : 'Desplegar todo';
  btn.title = t; btn.setAttribute('aria-label', t);
  btn.innerHTML = `<i class="fa-solid fa-angles-${anyOpen ? 'up' : 'down'}"></i>`;
}
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

// v8.04: «Mover zonas» (menú de la cabecera): contrae todas las zonas, que así se pueden arrastrar (mantener pulsado)
function startZoneSortMode() {
  if (exploreView !== 'zonas') { exploreView = 'zonas'; try { localStorage.setItem('numis_explore_view', 'zonas'); } catch (e) {} }
  collapseAllZones();
  window.scrollTo(0, 0);
  const row = document.getElementById('xp-addzone'); if (row) row.classList.remove('xp-open');
  const n = document.getElementById('xp-sorthint');
  if (n) { n.classList.add('xp-open'); clearTimeout(startZoneSortMode.t); startZoneSortMode.t = setTimeout(() => n.classList.remove('xp-open'), 6000); }
}
function toggleAddZoneRow(forceOpen) {
  const row = document.getElementById('xp-addzone'), btn = document.getElementById('xh-newzone');
  if (!row) return;
  if (forceOpen !== false) closeAddCountryRow();
  const open = row.classList.toggle('xp-open', forceOpen === true ? true : undefined);
  if (btn) btn.classList.toggle('xp-on', open);
  if (open) { const nc = document.getElementById('new-zone-continent'); if (nc) nc.value = exploreContinent || ''; const i = document.getElementById('new-zone-name'); if (i) i.focus(); }
}

/* v8.29: añadir un país sin monedas. Se guarda con keep:true (no lo borra la limpieza de países vacíos), sale en Explorar
   con su ficha y en el Índice como cualquier otro; al añadirle períodos/monedas funciona como el resto. */
function closeAddCountryRow() {
  const row = document.getElementById('xp-addcountry'), btn = document.getElementById('xh-newcountry');
  if (row) row.classList.remove('xp-open');
  if (btn) btn.classList.remove('xp-on');
}
function toggleAddCountryRow() {
  const row = document.getElementById('xp-addcountry'), btn = document.getElementById('xh-newcountry');
  if (!row) return;
  const open = !row.classList.contains('xp-open');
  if (open) { const z = document.getElementById('xp-addzone'), zb = document.getElementById('xh-newzone'); if (z) z.classList.remove('xp-open'); if (zb) zb.classList.remove('xp-on'); }
  row.classList.toggle('xp-open', open);
  if (btn) btn.classList.toggle('xp-on', open);
  if (open) {
    const sel = document.getElementById('new-country-zone');
    if (sel) sel.innerHTML = '<option value="">Zona automática</option>' + allZones().map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('');
    const i = document.getElementById('new-country-name'); if (i) i.focus();
  }
}
function addEmptyCountry() {
  const input = document.getElementById('new-country-name');
  const name = String(input.value || '').trim().replace(/\s+/g, ' ');
  if (!name) return;
  if (findCountryByName(name)) { alert('Ya existe un país con ese nombre.'); return; }
  const c = getOrCreateCountry(name);
  c.keep = true;   // sin monedas ni períodos: se conserva
  const zone = (document.getElementById('new-country-zone') || {}).value || '';
  if (zone) c.continent = zone;
  persistMeta();
  input.value = '';
  closeAddCountryRow();
  // Con un filtro de continente que lo ocultaría, se quita el filtro para que se vea la ficha nueva
  if (exploreContinent && zoneContinent(continentOf(c)) !== exploreContinent) exploreContinent = '';
  exploreSearch = ''; const es = document.getElementById('explorar-search'); if (es) es.value = '';
  exploreClosed[continentOf(c)] = false;
  renderExplorar();
  if (typeof navSync === 'function') navSync();
  const card = document.querySelector(`.xp-card[data-cid="${CSS.escape(c.id)}"]`);
  if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); card.classList.add('ring-2', 'ring-amber-500'); setTimeout(() => card.classList.remove('ring-2', 'ring-amber-500'), 1800); }
}

function onExploreSearch(value) { exploreSearch = value; renderExplorar(); }

function countryStats(c) {
  const normal = completionList(coinsOfCountry(c.id)).filter(isCompletionNormal);   // v7.08: las variantes no cuentan
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

function editCountryCard(countryId) { currentCountryId = countryId; openEditCountryModal(); }

/* Bolas de "PERIODOS": una por período creado, rellena (como un círculo de progreso) según lo completo que esté.
   Caben en un hueco de 84 × 32 px (máx. 5 por fila y 3 filas): se elige el mayor tamaño de bola con el que entran todas; con pocas bolas salen más grandes. */
const DOTS_BOX_W = 84, DOTS_BOX_H = 32, DOTS_MAX_COLS = 5, DOTS_MAX_ROWS = 3, DOTS_GAP = 0.25;   // como mucho 5 bolas por fila y 3 filas
function dotsLayout(n) {
  n = Math.max(1, n);
  const k = DOTS_GAP;   // separación = 25 % del diámetro de la bola
  const cols = Math.min(DOTS_MAX_COLS, n), rows = Math.min(DOTS_MAX_ROWS, Math.ceil(n / DOTS_MAX_COLS));   // primero se llena la fila de 5; la sobrante baja (7 → 5 + 2)
  const s = Math.floor(Math.min(DOTS_BOX_H / (rows + (rows - 1) * k), DOTS_BOX_W / (cols + (cols - 1) * k), DOTS_BOX_H) * 10) / 10;
  return { s, g: Math.round(s * k * 10) / 10, cols, shown: Math.min(n, DOTS_MAX_ROWS * DOTS_MAX_COLS) };   // (más de 15 períodos: se dibujan los 15 primeros)
}
function periodPctOf(p) {
  const all = completionList(coinsOfPeriod(p.id)), normal = all.filter(isCompletionNormal), list = normal.length ? normal : all.filter(x => !isSetCoin(x));   // un período solo de plata se mide con sus monedas de plata
  return list.length ? Math.round(list.filter(x => x.acquired).length / list.length * 100) : 0;
}

function countryCardHtml(c) {
  const s = countryStats(c);
  const pers = periodsOfCountry(c.id), eras = pers.length;
  const lay = dotsLayout(eras);
  const dots = pers.slice(0, lay.shown).map(p => { const pc = periodPctOf(p); return `<i style="--p:${pc}" title="${esc(periodDisplayName(p))}: ${pc}%"></i>`; }).join('');
  const name = prettyName(c.name);
  const photo = (typeof c.photo === 'string' && c.photo.startsWith('data:image/')) ? c.photo : '';
  const id = jsArg(c.id);
  return `
    <div class="xp-card" data-cid="${esc(c.id)}" onclick="jumpToCountry('${id}')" role="button" tabindex="0" aria-label="${esc(name)}: ${eras === 0 ? 'sin períodos' : eras + (eras === 1 ? ' período' : ' períodos') + ', ' + (s.t ? s.pct + '% completado' : 'sin monedas')}"><div class="xp-in">
      <div class="xp-photo ${photo ? '' : 'xp-empty'}" ${photo ? `style="background-image:url('${esc(photo)}')"` : ''}></div>
      <button type="button" class="xp-edit" onclick="event.stopPropagation(); editCountryCard('${id}')" aria-label="Editar ${esc(name)}" title="Editar"><i class="fa-solid fa-pen"></i></button>
      <span class="xp-flag" style="background:${flagLayers(c).replace(/"/g, '&quot;')}"></span>
      <div class="xp-dots" aria-hidden="true"><div class="xp-dots-b" style="--ds:${lay.s}px;--dg:${lay.g}px;--dc:${lay.cols}">${dots}</div></div>
      <div class="xp-pct ${s.pct >= 100 ? 'xp-p100' : ''}" title="${s.a} de ${s.t} monedas">${eras === 0 && s.t === 0 ? '-' : s.pct + '%'}</div>
      <div class="xp-name ${name.length > 14 ? 'xp-long' : (name.length > 9 ? 'xp-mid' : '')}">${esc(name)}</div>
    </div></div>`;
}


/* =====================================================================
   v9.03 · EXPLORAR «JUKEBOX / PASAPORTE»
   Un carrusel de fichas de pasaporte (una por país) con scroll-snap: un toque suave pasa a la siguiente y un golpe fuerte avanza varias.
   Las vecinas asoman por los lados (más pequeñas y atenuadas). Con un continente elegido sale una tira de zonas sincronizada con la ficha que ves.
   ===================================================================== */
function jukeData() {
  const zones = allZones();
  const groups = {};
  sortedCountries().forEach(c => { (groups[continentOf(c)] ||= []).push(c); });
  let order = applyZoneOrder([...zones, UNCLASSIFIED].filter(k => groups[k] || !BUILTIN_ZONES.includes(k) && k !== UNCLASSIFIED));
  if (exploreContinent) order = order.filter(k => k !== UNCLASSIFIED && zoneContinent(k) === exploreContinent);
  const q = normKey(String(exploreSearch || '').trim());
  const chipZones = order.filter(k => (groups[k] || []).length);
  let items = [];
  order.forEach(z => {
    if (exploreZone && exploreContinent && z !== exploreZone) return;
    let list = groups[z] || [];
    if (q && !normKey(z).startsWith(q)) list = list.filter(c => normKey(c.name).startsWith(q));
    list.forEach(c => items.push({ c, zone: z }));
  });
  return { items, chipZones, groups };
}
function jukeRing(pct, label) {
  const r = 21, L = 2 * Math.PI * r;
  return `<svg class="xj-ring" viewBox="0 0 50 50" aria-hidden="true"><circle cx="25" cy="25" r="${r}" class="xj-ring-bg"/><circle cx="25" cy="25" r="${r}" class="xj-ring-fg" style="stroke-dasharray:${(L * Math.min(100, pct) / 100).toFixed(1)} ${L.toFixed(1)}"/><text x="25" y="26.5" text-anchor="middle" dominant-baseline="middle" class="xj-ring-t">${label}</text></svg>`;
}
function jukeCardHtml(c, zone, i) {
  const s = countryStats(c), name = prettyName(c.name), id = jsArg(c.id);
  const photo = (typeof c.photo === 'string' && c.photo.startsWith('data:image/')) ? c.photo : '';
  const pers = periodsOfCountry(c.id);
  const ranked = pers.map(p => ({ p, n: coinsOfPeriod(p.id).length, pc: periodPctOf(p) }));
  const main = (ranked.length > 4 ? ranked.slice().sort((a, b) => b.n - a.n).slice(0, 4).sort((a, b) => (a.p.order ?? 0) - (b.p.order ?? 0)) : ranked);
  const more = ranked.length - main.length;
  const pills = main.map(({ p, pc }) => `<div class="xj-pill" style="--p:${pc}"><span class="xj-pill-n">${esc(periodDisplayName(p))}</span><b>${pc}%</b></div>`).join('')
    + (more > 0 ? `<div class="xj-more">+ ${more} ${more === 1 ? 'época más' : 'épocas más'}</div>` : '')
    + (!ranked.length ? '<div class="xj-more">Aún sin épocas</div>' : '');
  const stamp = (s.t > 0 && s.pct >= 100) ? '<div class="xj-stamp xj-stamp-ok">COMPLETADO</div>' : (s.a === 0 ? '<div class="xj-stamp xj-stamp-0">POR EXPLORAR</div>' : '');
  const zc = zoneContinent(zone);
  const edit = (typeof catalogEditAllowed === 'function' && catalogEditAllowed()) ? `<button type="button" class="xj-edit" onclick="event.stopPropagation(); editCountryCard('${id}')" aria-label="Editar ${esc(name)}" title="Editar"><i class="fa-solid fa-pen"></i></button>` : '';
  return `<div class="xj-card${s.a === 0 ? ' xj-zero' : ''}" data-cid="${esc(c.id)}" data-i="${i}" data-zone="${esc(zone)}" onclick="jukeOpen('${id}')" role="button" tabindex="0" aria-label="${esc(name)}: ${s.t ? s.pct + '% completado' : 'sin monedas'}">
    <div class="xj-visa">
      <span class="xj-flag" style="background:${flagLayers(c).replace(/"/g, '&quot;')}"></span>
      <div class="xj-id"><div class="xj-name ${name.length > 16 ? 'xj-long' : ''}">${esc(name)}</div><div class="xj-zone">${esc(zone === UNCLASSIFIED ? 'Sin clasificar' : zone)}${zc && zc !== zone ? ' · ' + esc(zc) : ''}</div></div>
      ${jukeRing(s.pct, s.t ? s.pct + '%' : '-')}
    </div>
    <div class="xj-photo ${photo ? '' : 'xj-nophoto'}" ${photo ? `style="background-image:url('${esc(photo)}')"` : `style="background:${flagLayers(c).replace(/"/g, '&quot;')}"`}>${stamp}${edit}${photo ? '' : '<i class="fa-solid fa-landmark xj-ph-ico"></i>'}</div>
    <div class="xj-eras">${pills}</div>
  </div>`;
}
function renderJukebox() {
  const { items, chipZones, groups } = jukeData();
  const total = chipZones.reduce((m, z) => m + (groups[z] || []).length, 0);
  const admin = typeof catalogEditAllowed === 'function' && catalogEditAllowed();
  if (!items.length) {
    const q = String(exploreSearch || '').trim();
    return `<div class="xp-empty-msg">${q ? `Nada coincide con «${esc(q)}».` : exploreContinent ? `Aún no hay países de ${esc(exploreContinent)}.` : 'Aún no hay países.'}</div>`;
  }
  const chips = exploreContinent ? `<div class="xj-chips" id="xj-chips">
      <button type="button" class="xj-chip${!exploreZone ? ' xj-sel' : ''}" data-z="" onclick="jukeZone('')">Todas <small>${total}</small></button>
      ${chipZones.map(z => `<button type="button" class="xj-chip${exploreZone === z ? ' xj-sel' : ''}" data-z="${esc(z)}" onclick="jukeZone('${jsArg(z)}')">${esc(z)} <small>${(groups[z] || []).length}</small></button>`).join('')}
    </div>` : '';
  const cards = items.map((x, i) => jukeCardHtml(x.c, x.zone, i)).join('')
    + (admin ? `<button type="button" class="xj-card xj-add" onclick="toggleAddCountryRow()"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Añadir país</button>` : '');
  return `${chips}<div class="xj-track" id="xj-track">${cards}</div>
    <div class="xj-pos"><span id="xj-count">1 / ${items.length}</span><div class="xj-posbar"><i id="xj-posfill" style="width:${(100 / items.length).toFixed(1)}%"></i></div></div>`;
}
function jukeZone(z) {
  exploreZone = z; exploreJukeId = '';
  renderExplorar();
}
function jukeOpen(id) { exploreJukeId = id; jumpToCountry(id); }
let _jukeRaf = 0;
function jukeInit(box) {
  const track = box.querySelector('#xj-track'); if (!track) return;
  const cards = [...track.querySelectorAll('.xj-card')];
  const fit = () => {
    const W = track.clientWidth; if (!W) return;
    const cw = Math.min(Math.round(W * 0.84), 440);
    const top = track.getBoundingClientRect().top, nav = (document.querySelector('.xn-bar') || { offsetHeight: 72 }).offsetHeight || 72;
    const h = Math.max(380, Math.min(680, window.innerHeight - top - nav - 62));
    track.style.setProperty('--xj-cw', cw + 'px'); track.style.setProperty('--xj-h', h + 'px');
    track.style.paddingLeft = track.style.paddingRight = Math.max(0, Math.round((W - cw) / 2)) + 'px';
  };
  fit();
  const update = () => {
    _jukeRaf = 0;
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0, bd = Infinity;
    cards.forEach((el, i) => {
      const c = el.offsetLeft + el.offsetWidth / 2, d = Math.min(1, Math.abs(c - mid) / (el.offsetWidth * 0.9));
      el.style.transform = `scale(${(1 - d * 0.1).toFixed(3)})`; el.style.opacity = (1 - d * 0.5).toFixed(2);
      if (Math.abs(c - mid) < bd) { bd = Math.abs(c - mid); best = i; }
    });
    const cur = cards[best]; if (!cur || cur.classList.contains('xj-add')) return;
    exploreJukeId = cur.dataset.cid;
    const n = cards.filter(x => !x.classList.contains('xj-add')).length;
    const cnt = document.getElementById('xj-count'); if (cnt) cnt.textContent = `${best + 1} / ${n}`;
    const pf = document.getElementById('xj-posfill'); if (pf) pf.style.width = ((best + 1) / n * 100).toFixed(1) + '%';
    const chips = document.getElementById('xj-chips');
    if (chips) {
      const z = exploreZone || cur.dataset.zone;
      chips.querySelectorAll('.xj-chip').forEach(b => b.classList.toggle('xj-cur', !exploreZone && b.dataset.z === z));
      const on = chips.querySelector(`.xj-chip[data-z="${CSS.escape ? CSS.escape(z) : z}"]`) || null;
      if (on && !exploreZone) { const target = on.offsetLeft - (chips.clientWidth - on.offsetWidth) / 2; if (Math.abs(chips.scrollLeft - target) > 4) chips.scrollTo({ left: Math.max(0, target), behavior: 'smooth' }); }
    }
  };
  track.addEventListener('scroll', () => { if (!_jukeRaf) _jukeRaf = requestAnimationFrame(update); }, { passive: true });
  const target = cards.find(c => c.dataset.cid === exploreJukeId) || cards[0];
  track.style.scrollBehavior = 'auto';
  track.scrollLeft = target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2;
  update();
  if (!jukeInit.bound) { jukeInit.bound = true; window.addEventListener('resize', () => { if (currentTab === 'explorar' && exploreView === 'jukebox') renderExplorar(); }); }
}

function renderExplorar() {
  const box = document.getElementById('explorar-content');
  if (!box) return;
  if (countries.length === 0) { box.innerHTML = `<div class="xp-empty-msg">Aún no hay países en la colección.</div>`; updateExploreToggle(); return; }
  syncContinentButtons();
  const nc = document.getElementById('new-zone-continent');
  if (nc && !nc.options.length) nc.innerHTML = continentOptionsHtml('');
  if (exploreView === 'jukebox') { box.innerHTML = renderJukebox(); jukeInit(box); updateExploreToggle(); return; }
  box.innerHTML = renderContinents();
  restoreRowScroll(box);
  hydrateImages(box);
  updateExploreToggle();
}

/* v8.30: scroll lateral de cada fila de países (por zona). Se guarda al desplazar y se recupera al repintar o al volver con «atrás» desde un país.
   Al entrar en Explorar desde otra pestaña (no con «atrás») se empieza de cero (switchTab llama a resetRowScroll). */
const exploreRowScroll = {};
function resetRowScroll() { Object.keys(exploreRowScroll).forEach(k => delete exploreRowScroll[k]); }
function restoreRowScroll(box) {
  box.querySelectorAll('section[data-zone]').forEach(sec => {
    const x = exploreRowScroll[sec.dataset.zone], row = sec.querySelector('.xp-row');
    if (x && row) row.scrollLeft = x;
  });
}
document.addEventListener('scroll', e => {
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains('xp-row') || t.scrollWidth === 0) return;
  const sec = t.closest('section[data-zone]');
  if (sec && t.offsetParent !== null) exploreRowScroll[sec.dataset.zone] = t.scrollLeft;
}, true);

function renderContinents() {
  const zones = allZones();
  const groups = {};
  sortedCountries().forEach(c => { (groups[continentOf(c)] ||= []).push(c); });
  // Las zonas predefinidas vacías no se muestran; las propias sí, para poder llenarlas
  let order = applyZoneOrder([...zones, UNCLASSIFIED].filter(k => groups[k] || !BUILTIN_ZONES.includes(k) && k !== UNCLASSIFIED));
  // Filtro por continente: solo las zonas de ese continente (con filtro activo no sale "Sin clasificar")
  if (exploreContinent) order = order.filter(k => k !== UNCLASSIFIED && zoneContinent(k) === exploreContinent);

  const q = normKey(exploreSearch.replace(/^\s+/, '').replace(/\s+$/, ''));   // v8.10: texto predictivo por inicial
  // v7.08: el lápiz de editar zona solo sale cuando están TODAS contraídas
  // v8.02: cualquier zona contraída se puede arrastrar para ordenarla, aunque haya otras desplegadas
  const allCollapsed = !q && order.length > 0 && order.every(k => exploreClosed[k]);
  let shown = 0;
  const html = order.map((cont, idx) => {
    const all = (groups[cont] || []).map(c => ({ c, s: countryStats(c) }));
    let list = all;
    if (q) {
      const zoneHit = normKey(cont).startsWith(q);   // zonas que EMPIEZAN por lo escrito (se ven con todos sus países)
      if (!zoneHit) list = all.filter(({ c }) => normKey(c.name).startsWith(q));   // o países que empiezan por lo escrito
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
      <section data-zone="${esc(cont)}" class="xp-zone${(!q && closed) ? ' xp-sortable' : ''}">
        <div class="xp-head" ${(!q && closed) ? 'onpointerdown="zoneDragStart(event)"' : ''} onclick="toggleExploreContinent('${zid}')" role="button" aria-expanded="${!closed}" aria-label="${esc(cont)}">
          <span class="xp-num">${num}</span>
          <span class="xp-title">${esc(cont)}</span>
          ${(!isBuiltin && !isUncl && allCollapsed) ? `
            <button type="button" class="xp-mini" onclick="event.stopPropagation(); openEditZoneModal('${zid}')" title="Editar zona" aria-label="Editar zona"><i class="fa-solid fa-pen text-[11px]"></i></button>` : ''}
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
  if (!q && shown === 0 && exploreContinent) return `<div class="xp-empty-msg">Aún no hay zonas de ${esc(exploreContinent)}.<br>Elige el continente en «Editar zona» (lápiz de la zona).</div>`;
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
  // v8.02: durante el arrastre las demás zonas se pliegan (solo visualmente) para poder ordenar entre ellas;
  // se mantiene la tarjeta bajo el dedo compensando el salto de altura
  const topBefore = d.card.getBoundingClientRect().top;
  const box = document.getElementById('explorar-content');
  if (box) box.classList.add('xp-dragmode');
  const topAfter = d.card.getBoundingClientRect().top;
  d.startY = d.y - (topBefore - topAfter);
  d.card.style.transition = 'none';
  d.card.style.position = 'relative';
  d.card.style.zIndex = '40';
  d.card.style.transform = 'scale(1.02)';
  d.card.style.boxShadow = '0 14px 34px rgba(var(--xp-plum-rgb),0.40)';
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
  // Con un filtro de continente solo se ven algunas zonas: se recolocan solo esas, en los huecos que ya ocupaban, y las demás no se mueven
  const full = applyZoneOrder([...allZones(), UNCLASSIFIED]);
  const slots = full.map((k, i) => names.includes(k) ? i : -1).filter(i => i >= 0);
  const merged = full.slice();
  slots.forEach((slot, n) => { merged[slot] = names[n]; });
  zoneOrder = merged;
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
    const box = document.getElementById('explorar-content');
    if (box) box.classList.remove('xp-dragmode');
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


/* ----- Tarjeta de país: ya no se edita con pulsación larga; se usa el icono de la esquina inferior izquierda de la foto.
   En móvil, mantener pulsado no debe abrir el menú contextual del navegador sobre la tarjeta ----- */
window.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.xp-card[data-cid]')) e.preventDefault(); });

/* ----- Ordenar los países dentro de su zona geográfica (desde el menú de edición) ----- */
function countriesInZoneOf(countryId) {
  const c = countryById(countryId);
  if (!c) return [];
  const z = continentOf(c);
  return sortedCountries().filter(x => continentOf(x) === z);
}
function updateCountryMoveUI() {
  const list = countriesInZoneOf(currentCountryId);
  const i = list.findIndex(x => x.id === currentCountryId);
  const l = document.getElementById('btn-country-left'), r = document.getElementById('btn-country-right');
  if (l) l.disabled = i <= 0;
  if (r) r.disabled = i < 0 || i >= list.length - 1;
  const t = document.getElementById('edit-country-pos');
  if (t) t.textContent = i >= 0 ? `Posición ${i + 1} de ${list.length} en ${list.length ? continentOf(list[i]) : ''}` : '';
}
function moveCountryInZone(direction) {
  const zone = countriesInZoneOf(currentCountryId);
  const i = zone.findIndex(x => x.id === currentCountryId), t = i + direction;
  if (i < 0 || t < 0 || t >= zone.length) return;
  const all = sortedCountries();
  const ia = all.findIndex(x => x.id === currentCountryId), ib = all.findIndex(x => x.id === zone[t].id);
  [all[ia], all[ib]] = [all[ib], all[ia]];
  all.forEach((c, n) => { c.order = n; });
  persistMeta();
  renderExplorar();
  updateCountryMoveUI();
}
