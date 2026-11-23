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
  const cb = document.getElementById('xp-conts');
  if (cb) cb.style.display = (exploreView === 'jukebox' && exploreContinent) ? 'none' : '';   // v9.04: con un continente elegido en el jukebox, la barra de continentes desaparece (su sitio lo ocupan «atrás» y los subtipos)
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
function dotsLayout(n, BW = DOTS_BOX_W, BH = DOTS_BOX_H) {
  n = Math.max(1, n);
  const k = DOTS_GAP;   // separación = 25 % del diámetro de la bola
  const cols = Math.min(DOTS_MAX_COLS, n), rows = Math.min(DOTS_MAX_ROWS, Math.ceil(n / DOTS_MAX_COLS));   // primero se llena la fila de 5; la sobrante baja (7 → 5 + 2)
  const s = Math.floor(Math.min(BH / (rows + (rows - 1) * k), BW / (cols + (cols - 1) * k), BH) * 10) / 10;
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
/* =====================================================================
   v9.06 · FICHA «PASAPORTE»: bandera + nombre · foto · mapa · bolitas por período · código de lectura óptica, sobre un fondo de seguridad
   ===================================================================== */
// --- Patrones de seguridad: cada ficha recibe uno (y una variante) según su id; siempre el mismo para el mismo país ---
function jukeHash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function jukeRng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const jP = a => 'M' + a.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
const JUKE_PATTERNS = [
  // 0 rosetas de guilloche
  r => { let o = ''; for (let k = 0; k < 2; k++) { const cx = 60 + r() * 280 | 0, cy = 90 + r() * 460 | 0, n = 16 + r() * 14 | 0, rx = 70 + r() * 60 | 0, ry = rx * (.22 + r() * .25) | 0; for (let i = 0; i < n; i++) o += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${(i * 180 / n).toFixed(1)} ${cx} ${cy})"/>`; } return o; },
  // 1 ondas entrelazadas
  r => { let o = ''; const f = .012 + r() * .02, A = 10 + r() * 18, ph = .25 + r() * .4; for (let j = 0; j < 30; j++) { const a = []; for (let x = 0; x <= 400; x += 8) a.push([x, j * 22 + A * Math.sin(x * f + j * ph) + A * .5 * Math.sin(x * f * 2.3 - j * ph)]); o += `<path d="${jP(a)}"/>`; } return o; },
  // 2 curvas de nivel
  r => { let o = ''; for (let k = 0; k < 2; k++) { const cx = 40 + r() * 320, cy = 100 + r() * 440, p1 = r() * 6, p2 = r() * 6, a1 = .08 + r() * .1, a2 = .04 + r() * .08; for (let i = 1; i <= 24; i++) { const a = []; for (let t = 0; t <= 60; t++) { const th = t / 60 * Math.PI * 2, rr = i * 17 * (1 + a1 * Math.sin(3 * th + i * .35 + p1) + a2 * Math.sin(5 * th + p2)); a.push([cx + rr * Math.cos(th), cy + rr * Math.sin(th)]); } o += `<path d="${jP(a)}Z"/>`; } } return o; },
  // 3 celosía de rombos
  r => { let o = ''; const s = 12 + r() * 10 | 0; for (let i = -700; i < 1100; i += s) o += `<path d="M${i} 0L${i + 640} 640M${i + 640} 0L${i} 640"/>`; return o; },
  // 4 rayos
  r => { let o = ''; const cx = r() * 400, cy = r() * 640, n = 70 + r() * 60 | 0; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o += `<path d="M${cx.toFixed(0)} ${cy.toFixed(0)}L${(cx + 1100 * Math.cos(a)).toFixed(0)} ${(cy + 1100 * Math.sin(a)).toFixed(0)}"/>`; } return o; },
  // 5 trama de puntos
  r => { let o = ''; const cx = r() * 400, cy = r() * 640, g = 13 + r() * 5; for (let y = 6; y < 640; y += g) for (let x = 6; x < 400; x += g) { const d = Math.hypot(x - cx, y - cy), rad = Math.max(.3, 3.2 - d / 85); o += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad.toFixed(1)}" fill="currentColor" stroke="none"/>`; } return o; },
  // 6 flor de la vida
  r => { let o = ''; const R = 22 + r() * 10, dx = R * 1.732, ox = r() * dx, oy = r() * R; for (let row = -1; row < 640 / R + 2; row++) for (let col = -1; col < 400 / dx + 2; col++) o += `<circle cx="${(col * dx + (row % 2 ? dx / 2 : 0) + ox).toFixed(0)}" cy="${(row * R * 1.5 * .577 * 1.732 / 1.732 * 1 + oy).toFixed(0)}" r="${R.toFixed(0)}"/>`; return o; },
  // 7 moiré
  r => { let o = ''; const ax = 80 + r() * 100, ay = 120 + r() * 400, bx = ax + 30 + r() * 80, by = ay + (r() - .5) * 120; for (let i = 1; i < 46; i++) o += `<circle cx="${ax.toFixed(0)}" cy="${ay.toFixed(0)}" r="${i * 11}"/><circle cx="${(bx + 150).toFixed(0)}" cy="${by.toFixed(0)}" r="${i * 11}"/>`; return o; },
  // 8 espirógrafos
  r => { let o = ''; for (let k = 0; k < 3; k++) { const cx = 60 + r() * 280, cy = 110 + r() * 420, rr = 3 + (r() * 6 | 0), R = rr * (2 + (r() * 3 | 0)) + 1 + (r() * (rr - 1) | 0), dd = rr * (.5 + r() * 1.2), m = R - rr, sc = 105 / (m + dd), pts = []; for (let t = 0; t <= Math.PI * 2 * rr; t += .09) pts.push([cx + sc * (m * Math.cos(t) + dd * Math.cos(m / rr * t)), cy + sc * (m * Math.sin(t) - dd * Math.sin(m / rr * t))]); o += `<path d="${jP(pts)}Z"/>`; } return o; },
  // 9 bandas trenzadas
  r => { let o = ''; for (let b = 0; b < 5; b++) { const y0 = 40 + b * 125 + r() * 25, A = 22 + r() * 14, f = .018 + r() * .02; for (let k = 0; k < 7; k++) { const a = []; for (let x = 0; x <= 400; x += 6) a.push([x, y0 + A * Math.sin(x * f + k * .45) * Math.cos(x * f * .5 + b)]); o += `<path d="${jP(a)}"/>`; } } return o; },
  // 10 escamas
  r => { let o = ''; const R = 15 + r() * 10, ox = r() * R * 2; for (let row = 0; row < 640 / (R * .6) + 2; row++) for (let x = -R * 2; x < 400 + R * 2; x += R * 2) { const cx = x + (row % 2 ? R : 0) + ox % (R * 2), cy = row * R * .6; o += `<path d="M${(cx - R).toFixed(0)} ${cy.toFixed(0)}a${R.toFixed(0)} ${R.toFixed(0)} 0 0 0 ${(R * 2).toFixed(0)} 0"/>`; } return o; },
  // 11 panal
  r => { let o = ''; const R = 15 + r() * 8, w = R * 1.732; for (let row = -1; row < 640 / (R * 1.5) + 2; row++) for (let col = -1; col < 400 / w + 2; col++) { const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * R * 1.5, a = []; for (let i = 0; i < 6; i++) { const t = Math.PI / 3 * i + Math.PI / 6; a.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]); } o += `<path d="${jP(a)}Z"/>`; } return o; },
  // 12 espirales
  r => { let o = ''; for (let s = 0; s < 3; s++) { const cx = 50 + r() * 300, cy = 100 + r() * 440, arms = 3 + r() * 4 | 0, k = 3 + r() * 3; for (let m = 0; m < arms; m++) { const a = []; for (let t = 0; t < 260; t++) { const th = t / 20 + m * Math.PI * 2 / arms, rr = k * t / 4; a.push([cx + rr * Math.cos(th), cy + rr * Math.sin(th)]); } o += `<path d="${jP(a)}"/>`; } } return o; },
  // 13 Lissajous
  r => { let o = ''; const a = 2 + r() * 5 | 0, b = a + 1 + r() * 3 | 0; for (let k = 0; k < 14; k++) { const pts = []; for (let t = 0; t <= 200; t++) { const th = t / 200 * Math.PI * 2; pts.push([200 + 190 * Math.sin(a * th + k * .22), 320 + (300 - k * 6) * Math.sin(b * th)]); } o += `<path d="${jP(pts)}Z"/>`; } return o; },
  // 14 rosas polares
  r => { let o = ''; for (let k = 0; k < 4; k++) { const cx = 60 + r() * 280, cy = 100 + r() * 440, n = 3 + r() * 7 | 0, R = 90 + r() * 90, rot = r() * 6; for (let q = 0; q < 4; q++) { const pts = []; for (let t = 0; t <= 240; t++) { const th = t / 240 * Math.PI * 2, rr = R * (1 - q * .17) * Math.cos(n * th); pts.push([cx + rr * Math.cos(th + rot), cy + rr * Math.sin(th + rot)]); } o += `<path d="${jP(pts)}Z"/>`; } } return o; },
  // 15 malla deformada
  r => { let o = ''; const A = 14 + r() * 18, f = .006 + r() * .008; for (let i = 0; i <= 26; i++) { const a = [], b = []; for (let t = 0; t <= 640; t += 10) { a.push([i * 16 + A * Math.sin(t * f * Math.PI + i * .1), t]); } o += `<path d="${jP(a)}"/>`; } for (let j = 0; j <= 42; j++) { const b = []; for (let x = 0; x <= 400; x += 10) b.push([x, j * 16 + A * Math.sin(x * f * Math.PI * 1.3 + j * .1)]); o += `<path d="${jP(b)}"/>`; } return o; },
  // 16 galones
  r => { let o = ''; const amp = 7 + r() * 8, st = 14 + r() * 6; for (let y = 0; y < 660; y += st) { const a = []; for (let x = 0; x <= 400; x += amp * 2) { a.push([x, y]); a.push([x + amp, y + amp]); } o += `<path d="${jP(a)}"/>`; } return o; },
  // 17 olas concéntricas (seigaiha)
  r => { let o = ''; const R = 34 + r() * 12 | 0, ox = r() * R * 2 | 0, st = R * .55; for (let row = 0; row < 640 / st + 2; row++) for (let col = -1; col < 400 / (R * 2) + 2; col++) { const cx = (col * R * 2 + (row % 2 ? R : 0) - ox) | 0, cy = row * st | 0; for (let q = 3; q >= 1; q--) o += `<circle class="sg" cx="${cx}" cy="${cy}" r="${R * q / 3 | 0}"/>`; } return o; }
];
function jukePatternSvg(id) {
  const h = jukeHash(id), r = jukeRng(h ^ 0x9e3779b9);
  return `<svg class="xj-sec" viewBox="0 86 400 467" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none" stroke="currentColor" stroke-width=".7">${JUKE_PATTERNS[h % JUKE_PATTERNS.length](r)}</svg>`;
}

// --- Código de tres letras asignado automáticamente (único entre países) ---
let _jukeCodes = null;
function jukeCodes() {
  if (_jukeCodes) return _jukeCodes;
  const used = new Set(), out = {};
  [...countries].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id))).forEach(c => {
    const L = String(c.name).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '') || 'XXX';
    const cons = [...L.slice(1)].filter(ch => !'AEIOU'.includes(ch));
    const cands = [];
    if (cons.length >= 2) cands.push(L[0] + cons[0] + cons[1]);
    cands.push(L.slice(0, 3));
    for (let i = 1; i < L.length; i++) for (let j = i + 1; j < L.length; j++) cands.push(L[0] + L[i] + L[j]);
    for (let i = 0; i < 26; i++) cands.push((L.slice(0, 2) + 'X').slice(0, 2) + String.fromCharCode(65 + i));
    let code = cands.find(x => x.length === 3 && !used.has(x)) || (L + 'XXX').slice(0, 3);
    used.add(code); out[c.id] = code;
  });
  return (_jukeCodes = out);
}
const mrzTxt = s => String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

// --- Mapa: qué países del mapa resalta una ficha ---
const HISTORIC_MULTI = {
  'urss': 'RU,UA,BY,MD,EE,LV,LT,GE,AM,AZ,KZ,UZ,TM,TJ,KG', 'union sovietica': 'RU,UA,BY,MD,EE,LV,LT,GE,AM,AZ,KZ,UZ,TM,TJ,KG',
  'yugoslavia': 'RS,HR,SI,BA,ME,MK', 'checoslovaquia': 'CZ,SK', 'rda': 'DE', 'alemania oriental': 'DE',
  'austria hungria': 'AT,HU,CZ,SK,SI,HR,BA', 'imperio austrohungaro': 'AT,HU,CZ,SK,SI,HR,BA',
  'imperio ruso': 'RU,UA,BY,MD,EE,LV,LT,GE,AM,AZ,KZ,UZ,TM,TJ,KG,FI,PL', 'imperio otomano': 'TR,SY,LB,IL,JO,IQ,PS',
  'rodesia': 'ZW', 'zaire': 'CD', 'prusia': 'DE,PL', 'sacro imperio romano': 'DE,AT,CZ,NL,BE,LU,CH'
};
function jukeMapKeys(c) {
  const toKeys = list => list.map(a => ISO_A22NUM[String(a).trim().toUpperCase().slice(0, 2)]).filter(Boolean);
  if (c.mapCodes) { const k = toKeys(String(c.mapCodes).split(/[\s,;]+/).filter(Boolean)); if (k.length) return k; }
  const m = typeof multiCountryA2 === 'function' ? multiCountryA2(c.name) : null;
  if (m) return toKeys(m);
  const fk = typeof flagLookup === 'function' ? flagLookup(c.name).key : '';
  if (fk && HISTORIC_MULTI[fk]) return toKeys(HISTORIC_MULTI[fk].split(','));
  const a2 = (typeof flagCode === 'function' ? flagCode(c) : '').slice(0, 2);
  return a2 ? toKeys([a2]) : [];
}
let _jukeDefs = false;
function jukeEnsureDefs() {
  if (_jukeDefs || !worldMap) return;
  _jukeDefs = true;
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="wm-defs" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true"><defs>${worldMap.feats.map((f, i) => `<path id="wm${i}" d="${f.d}"/>`).join('')}</defs></svg>`;
  document.body.appendChild(holder.firstChild);
}
const JUKE_MAP_AR = 3.2;
let _jukeDN = null;
function jukeRegion(key) {
  const a2 = ISO_NUM2A2[key]; if (!a2) return '';
  try { _jukeDN ||= new Intl.DisplayNames(['es'], { type: 'region' }); const n = _jukeDN.of(a2); return n && n !== a2 ? n : ''; } catch (e) { return ''; }
}
// Inversa de la proyección Natural Earth (plano → grados), por Newton
function neInvert(px, py) {
  const g = f => { const f2 = f * f, f4 = f2 * f2; return f * (1.007226 + f2 * (0.015085 + f4 * (-0.044475 + 0.028874 * f2 - 0.005916 * f4))); };
  const target = -py; let f = Math.max(-1.5, Math.min(1.5, target));
  for (let i = 0; i < 14; i++) { const d = (g(f + 1e-5) - g(f - 1e-5)) / 2e-5 || 1; f -= (g(f) - target) / d; f = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, f)); }
  const f2 = f * f, f4 = f2 * f2;
  return [px / (0.8707 - 0.131979 * f2 + f4 * (-0.013791 + f4 * (0.003971 * f2 - 0.001529 * f4))) * 180 / Math.PI, f * 180 / Math.PI];
}
const jukeToProj = (m, x, y) => [x / m.k + m.minX, y / m.k + m.minY];
// Retícula de meridianos y paralelos de la zona visible
function jukeGrat(x, y, w, h) {
  const m = worldMap; if (!m || !m.k) return '';
  const P = (lon, lat) => { const q = neProject(lon, lat); return [(q[0] - m.minX) * m.k, (q[1] - m.minY) * m.k]; };
  const c = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(p => neInvert(...jukeToProj(m, p[0], p[1])));
  const lo0 = Math.min(...c.map(a => a[0])), lo1 = Math.max(...c.map(a => a[0])), la0 = Math.max(-85, Math.min(...c.map(a => a[1])) - 2), la1 = Math.min(85, Math.max(...c.map(a => a[1])) + 2);
  const step = [1, 2, 5, 10, 15, 20, 30, 45].find(t => (lo1 - lo0) / t <= 6) || 45;
  let d = '';
  for (let L = Math.ceil((lo0 - 1) / step) * step; L <= lo1 + 1; L += step) { const a = []; for (let la = la0; la <= la1; la += 2) a.push(P(L, la)); if (a.length > 1) d += jP(a); }
  for (let B = Math.ceil(la0 / step) * step; B <= la1; B += step) { const a = []; for (let lo = lo0 - 2; lo <= lo1 + 2; lo += 2) a.push(P(lo, B)); if (a.length > 1) d += jP(a); }
  return `<path class="xj-gr" d="${d}"/>`;
}
const JUKE_COMPASS = `<svg class="xj-cmp" viewBox="-20 -22 40 40" aria-hidden="true"><circle r="14" class="xj-cmp-c"/><path d="M0-12L3.6 0L-3.6 0Z" class="xj-cmp-n"/><path d="M0 12L3.6 0L-3.6 0Z" class="xj-cmp-s"/><path d="M-14 0H-10M10 0H14" class="xj-cmp-t"/><text x="0" y="-15.6" text-anchor="middle" class="xj-cmp-l">N</text></svg>`;
function jukeMapSvg(keys, AR) {
  AR = AR > 0.8 && AR < 8 ? AR : JUKE_MAP_AR;   // proporción real del recuadro del mapa (así el encuadre no se recorta por los lados)
  if (!worldMap) return '';
  jukeEnsureDefs();
  const W = worldMap.W, H = worldMap.H, F = worldMap.feats, set = new Set(keys);
  const hi = F.map((f, i) => ({ f, i })).filter(x => set.has(x.f.key));
  let x, y, w, ccx = W / 2, ccy = H / 2;
  if (!hi.length) { w = W; x = 0; y = 0; }
  else {
    const x0 = Math.min(...hi.map(a => a.f.bx0)), x1 = Math.max(...hi.map(a => a.f.bx1)), y0 = Math.min(...hi.map(a => a.f.by0)), y1 = Math.max(...hi.map(a => a.f.by1));
    w = Math.min(W, Math.max((x1 - x0) * 1.45, (y1 - y0) * 1.45 * AR, 90));
    x = (x0 + x1) / 2 - w / 2; y = (y0 + y1) / 2 - w / AR / 2;
    ccx = (x0 + x1) / 2; ccy = (y0 + y1) / 2;
  }
  const h = w / AR;
  x = Math.max(0, Math.min(W - w, x)); y = Math.max(0, Math.min(H - h, y));
  const inView = a => a.f.bx1 >= x && a.f.bx0 <= x + w && a.f.by1 >= y && a.f.by0 <= y + h;
  const land = F.map((f, i) => ({ f, i })).filter(a => !set.has(a.f.key) && inView(a)).map(a => `<use href="#wm${a.i}"/>`).join('');
  const high = hi.map(a => `<use href="#wm${a.i}"/>`).join('');
  const dots = hi.filter(a => a.f.tiny || a.f.size < w * .035).map(a => `<circle cx="${a.f.cx.toFixed(1)}" cy="${a.f.cy.toFixed(1)}" r="${(w * .014).toFixed(2)}" class="xj-mk"/>`).join('');
  // v9.07: nombres de los países vecinos (los más grandes de la zona, sin solaparse)
  let labels = '';
  if (hi.length) {
    const fs = w * .03, placed = [];
    F.map((f, i) => ({ f, i })).filter(a => !set.has(a.f.key) && inView(a) && a.f.size >= w * .085 && a.f.cx > x + fs && a.f.cx < x + w - fs && a.f.cy > y + fs && a.f.cy < y + h - fs)
      .sort((a, b) => b.f.size - a.f.size).slice(0, 14).forEach(a => {
        if (placed.length >= 6) return;
        const nm = jukeRegion(a.f.key).toUpperCase(); if (!nm) return;
        const tw = nm.length * fs * .7, th = fs * 1.15, r = [a.f.cx - tw / 2, a.f.cy - th / 2, a.f.cx + tw / 2, a.f.cy + th / 2];
        if (r[0] < x + 2 || r[2] > x + w - 2) return;
        if (placed.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) return;
        placed.push(r);
        labels += `<text x="${a.f.cx.toFixed(1)}" y="${(a.f.cy + fs * .35).toFixed(1)}" text-anchor="middle" class="xj-nb" font-size="${fs.toFixed(2)}" stroke-width="${(fs * .24).toFixed(2)}">${esc(nm)}</text>`;
      });
  }
  // v9.07: brújula y coordenadas del centro de la zona
  const ll = neInvert(...jukeToProj(worldMap, ccx, ccy)), lat = ll[1], lon = ll[0];
  const coord = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'O'}`;
  return `<svg viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g>${jukeGrat(x, y, w, h)}</g><g class="xj-land">${land}</g><g class="xj-hi">${high}</g>${dots}${labels}</svg><div class="xj-co">${coord}</div>${JUKE_COMPASS}`;
}
function jukeFillMaps(cards, best) {
  for (let i = Math.max(0, best - 2); i <= Math.min(cards.length - 1, best + 2); i++) {
    const el = cards[i], box = el.querySelector('.xj-map'); if (!box || box.dataset.ok) continue;
    if (!worldMap) { if (!box.dataset.ld) box.innerHTML = '<i class="fa-solid fa-earth-europe xj-map-ph"></i>'; continue; }
    box.innerHTML = jukeMapSvg((box.dataset.mk || '').split(',').filter(Boolean), box.clientWidth / (box.clientHeight || 1)); box.dataset.ok = '1';
  }
}

// --- Bolitas: tamaño y filas según cuántos períodos haya ---
function jukeDotsLayout(n) {
  const cw = Math.min(Math.round(Math.max(320, document.documentElement.clientWidth) * 0.84), 460);
  const mg = Math.max(16, Math.min(26, cw * .06)), W = cw - 2 * mg - 78, H = 54, g = 5;
  let best = null;
  for (let rows = 1; rows <= 3; rows++) {
    const cols = Math.ceil(n / rows), s = Math.floor(Math.min(34, (W - (cols - 1) * g) / cols, (H - (rows - 1) * g) / rows));
    if (!best || s > best.s + 3) best = { s, cols, rows };   // se prefiere menos filas salvo que las bolitas ganen bastante
    if (s >= 24) { best = { s, cols, rows }; break; }
  }
  return best;
}

function jukeCardHtml(c, zone, i) {
  const s = countryStats(c), name = prettyName(c.name), id = jsArg(c.id);
  const photo = (typeof c.photo === 'string' && c.photo.startsWith('data:image/')) ? c.photo : '';
  const pers = periodsOfCountry(c.id), eras = pers.length;
  const lay = jukeDotsLayout(Math.max(1, Math.min(eras, 24)));
  const dots = pers.slice(0, 24).map(p => { const pc = periodPctOf(p); return `<button type="button" class="xj-dt" data-pid="${esc(p.id)}" style="--p:${pc}" aria-label="${esc(periodDisplayName(p))}: ${pc}%"></button>`; }).join('');
  const edit = (typeof catalogEditAllowed === 'function' && catalogEditAllowed()) ? `<button type="button" class="xj-edit" onclick="event.stopPropagation(); editCountryCard('${id}')" aria-label="Editar ${esc(name)}" title="Editar"><i class="fa-solid fa-pen"></i></button>` : '';
  const nCoins = coinsOfCountry(c.id).length, z = zone === UNCLASSIFIED ? 'SIN_CLASIFICAR' : mrzTxt(zone);
  const pad = t => (t + '<'.repeat(44)).slice(0, 44), n3 = n => String(Math.min(999, n)).padStart(3, '0');
  const l1 = pad(`P<${jukeCodes()[c.id] || 'XXX'}<${z}`), l2 = pad(`${n3(eras)}<PER${'<'.repeat(6)}${n3(nCoins)}<MON`);
  const nl = name.length;
  return `<div class="xj-card${s.a === 0 ? ' xj-zero' : ''}" data-cid="${esc(c.id)}" data-i="${i}" data-zone="${esc(zone)}" onclick="jukeOpen('${id}')" role="button" tabindex="0" aria-label="${esc(name)}: ${s.t ? s.pct + '% completado' : 'sin monedas'}">
    <div class="xj-photo ${photo ? '' : 'xj-nophoto'}" ${photo ? `style="background-image:url('${esc(photo)}')"` : ''}>${edit}</div>
    <div class="xj-body">
      ${jukePatternSvg(c.id)}
      <div class="xj-top"><span class="xj-fl" style="background:${flagLayers(c).replace(/"/g, '&quot;')}"></span><div class="xj-nm ${nl > 22 ? 'xj-n4' : nl > 16 ? 'xj-n3' : nl > 11 ? 'xj-n2' : ''}"><span>${esc(name)}</span></div></div>
      <div class="xj-map" data-mk="${jukeMapKeys(c).join(',')}"></div>
      <div class="xj-rw">
        <div class="xj-dots" style="--ds:${lay.s}px;--dc:${lay.cols}">${dots || '<span class="xj-nodots">Sin períodos</span>'}</div>
        <div class="xj-pc ${s.pct >= 100 ? 'xj-p100' : ''}" title="${s.a} de ${s.t} monedas"><b>${eras === 0 && s.t === 0 ? '-' : s.pct + '%'}</b><small>completado</small></div>
      </div>
    </div>
    <div class="xj-mr" aria-hidden="true">${esc(l1)}<br>${esc(l2)}</div>
  </div>`;
}

// --- Aviso con el nombre del período (ratón: al pasar por encima · móvil: al mantener pulsado); al tocarlo se va a ese período ---
let _jukeTip = null, _jukeTipTimer = 0, _jukePress = 0, _jukeSuppress = false;
function jukeTipHide() { clearTimeout(_jukeTipTimer); if (_jukeTip) { _jukeTip.remove(); _jukeTip = null; } }
function jukeTipShow(dot, hover) {
  const p = periodById(dot.dataset.pid); if (!p) return;
  if (_jukeTip && _jukeTip.dataset.pid === dot.dataset.pid) { clearTimeout(_jukeTipTimer); return; }
  jukeTipHide();
  const card = dot.closest('.xj-card'), t = document.createElement('button');
  t.type = 'button'; t.className = 'xj-tip' + (hover ? ' xj-tip-h' : ''); t.dataset.pid = dot.dataset.pid;
  t.innerHTML = `<b>${esc(periodDisplayName(p))}</b><span>${periodPctOf(p)}% · ${hover ? 'clic para abrir' : 'ir al período'} <i class="fa-solid fa-arrow-right"></i></span>`;
  t.onclick = e => { e.stopPropagation(); jukeTipHide(); jumpToPeriod(p.id); };
  t.onpointerenter = () => clearTimeout(_jukeTipTimer);
  t.onpointerleave = () => { _jukeTipTimer = setTimeout(jukeTipHide, 250); };
  card.appendChild(t);
  const cr = card.getBoundingClientRect(), dr = dot.getBoundingClientRect(), k = cr.width / card.offsetWidth || 1;
  const tw = t.offsetWidth, left = Math.max(8, Math.min(card.offsetWidth - tw - 8, (dr.left + dr.width / 2 - cr.left) / k - tw / 2));
  t.style.left = left + 'px'; t.style.bottom = ((cr.bottom - dr.top) / k + 6) + 'px';
  _jukeTip = t;
}
function jukeBindTips(track) {
  track.addEventListener('pointerover', e => { const d = e.target.closest('.xj-dt'); if (d && e.pointerType === 'mouse') { clearTimeout(_jukeTipTimer); jukeTipShow(d, true); } });
  track.addEventListener('pointerout', e => { if (e.pointerType === 'mouse' && e.target.closest('.xj-dt') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.xj-dt'))) _jukeTipTimer = setTimeout(jukeTipHide, 120); });
  track.addEventListener('pointerdown', e => {
    const d = e.target.closest('.xj-dt'); if (!d || e.pointerType === 'mouse') return;
    _jukeSuppress = false; clearTimeout(_jukePress);
    const x0 = e.clientX, y0 = e.clientY;
    _jukePress = setTimeout(() => { _jukeSuppress = true; jukeTipShow(d); if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) {} }, 420);
    const cancel = ev => { if (ev && ev.type === 'pointermove' && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return; clearTimeout(_jukePress); window.removeEventListener('pointermove', cancel); window.removeEventListener('pointerup', cancel); window.removeEventListener('pointercancel', cancel); };
    window.addEventListener('pointermove', cancel); window.addEventListener('pointerup', cancel); window.addEventListener('pointercancel', cancel);
  });
  track.addEventListener('contextmenu', e => { if (e.target.closest('.xj-dt')) e.preventDefault(); });
  track.addEventListener('click', e => {
    const d = e.target.closest('.xj-dt'); if (!d) return;
    if (_jukeSuppress) { _jukeSuppress = false; e.stopPropagation(); e.preventDefault(); return; }
    if (matchMedia('(hover:hover) and (pointer:fine)').matches) { e.stopPropagation(); jumpToPeriod(d.dataset.pid); }   // con ratón, clic directo en la bolita
  }, true);
  track.addEventListener('scroll', jukeTipHide, { passive: true });
  document.addEventListener('pointerdown', e => { if (_jukeTip && !e.target.closest('.xj-tip, .xj-dt')) jukeTipHide(); });
}

function renderJukebox() {
  _jukeCodes = null;
  const { items, chipZones, groups } = jukeData();
  const total = chipZones.reduce((m, z) => m + (groups[z] || []).length, 0);
  const admin = typeof catalogEditAllowed === 'function' && catalogEditAllowed();
  if (!items.length) {
    const q = String(exploreSearch || '').trim();
    return `<div class="xp-empty-msg">${q ? `Nada coincide con «${esc(q)}».` : exploreContinent ? `Aún no hay países de ${esc(exploreContinent)}.` : 'Aún no hay países.'}</div>`;
  }
  // v9.04: con un continente elegido, «atrás» + todos sus subtipos ocupan el sitio de la barra de continentes (el tamaño se ajusta al número de subtipos)
  const nCh = chipZones.length + 1, sz = nCh <= 6 ? '' : nCh <= 12 ? ' xj-cs-m' : nCh <= 20 ? ' xj-cs-s' : ' xj-cs-xs';
  const chips = exploreContinent ? `<div class="xj-subbar">
      <button type="button" class="xj-back" onclick="setExploreContinent('${jsArg(exploreContinent)}')" aria-label="Volver a los continentes" title="Atrás"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="xj-chips${sz}${exploreZonesOpen ? ' xj-open' : ''}" id="xj-chips">
        <button type="button" class="xj-chip${!exploreZone ? ' xj-sel' : ''}" data-z="" onclick="jukeZone('')">Todas <small>${total}</small></button>
        ${chipZones.map(z => `<button type="button" class="xj-chip${exploreZone === z ? ' xj-sel' : ''}" data-z="${esc(z)}" onclick="jukeZone('${jsArg(z)}')">${esc(z)} <small>${(groups[z] || []).length}</small></button>`).join('')}
      </div>
      ${chipZones.length > 3 ? `<button type="button" class="xj-more" onclick="jukeZonesToggle()" aria-label="${exploreZonesOpen ? 'Contraer' : 'Ver todos los subtipos'}"><i class="fa-solid fa-chevron-${exploreZonesOpen ? 'up' : 'down'}"></i></button>` : ''}
    </div>` : '';
  const cards = items.map((x, i) => jukeCardHtml(x.c, x.zone, i)).join('')
    + (admin ? `<button type="button" class="xj-card xj-add" onclick="toggleAddCountryRow()"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Añadir país</button>` : '');
  return `${chips}<div class="xj-stage"><button type="button" class="xj-arrow xj-prev" onclick="jukeStep(-1)" aria-label="Anterior"><i class="fa-solid fa-chevron-left"></i></button><button type="button" class="xj-arrow xj-next" onclick="jukeStep(1)" aria-label="Siguiente"><i class="fa-solid fa-chevron-right"></i></button><div class="xj-track" id="xj-track">${cards}</div></div>
    <div class="xj-pos"><span id="xj-count">1 / ${items.length}</span><div class="xj-posbar"><i id="xj-posfill" style="width:${(100 / items.length).toFixed(1)}%"></i></div></div>`;
}
let exploreZonesOpen = false;   // v9.05: subtipos en una sola línea; el botón los despliega todos
function jukeZonesToggle() { exploreZonesOpen = !exploreZonesOpen; const c = document.getElementById('xj-chips'); if (c) c.classList.toggle('xj-open', exploreZonesOpen); const b = document.querySelector('.xj-more i'); if (b) b.className = 'fa-solid fa-chevron-' + (exploreZonesOpen ? 'up' : 'down'); }
function jukeZone(z) {
  exploreZone = z; exploreJukeId = '';
  renderExplorar();
}
function jukeOpen(id) { exploreJukeId = id; jumpToCountry(id); }
let _jukeRaf = 0;
function jukeStep(d) {
  const track = document.getElementById('xj-track'); if (!track) return;
  const cards = [...track.querySelectorAll('.xj-card')]; if (!cards.length) return;
  const mid = track.scrollLeft + track.clientWidth / 2;
  let cur = 0, bd = Infinity;
  cards.forEach((el, i) => { const dd = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (dd < bd) { bd = dd; cur = i; } });
  const t = cards[Math.max(0, Math.min(cards.length - 1, cur + d))];
  track.scrollTo({ left: t.offsetLeft - (track.clientWidth - t.offsetWidth) / 2, behavior: 'smooth' });
}
function jukeInit(box) {
  const track = box.querySelector('#xj-track'); if (!track) return;
  const stage = track.parentElement;
  const cards = [...track.querySelectorAll('.xj-card')];
  const fit = () => {
    // v9.04: la tira ocupa todo el ancho de la pantalla (no solo el de la columna central) para que la ficha quede centrada en pantalla completa
    stage.style.marginLeft = '0px'; stage.style.width = '';
    const pr = stage.parentElement.getBoundingClientRect();
    stage.style.marginLeft = (-pr.left) + 'px'; stage.style.width = document.documentElement.clientWidth + 'px';
    const W = track.clientWidth; if (!W) return;
    const cw = Math.min(Math.round(W * 0.84), 460);
    const top = track.getBoundingClientRect().top, nav = (document.querySelector('.xn-bar') || { offsetHeight: 72 }).offsetHeight || 72;
    const h = Math.max(380, Math.min(700, window.innerHeight - top - nav - 62));
    track.style.setProperty('--xj-cw', cw + 'px'); track.style.setProperty('--xj-h', h + 'px');
    track.style.paddingLeft = track.style.paddingRight = Math.max(0, Math.round((W - cw) / 2)) + 'px';
    // v9.07: el patrón de seguridad se encuadra justo en la parte visible de la ficha (el cuerpo bajo la foto)
    const sz = cards.map(el => { const b = el.querySelector('.xj-body'); return b ? [b.offsetWidth, b.offsetHeight] : null; });
    cards.forEach((el, i) => { const sv = el.querySelector('.xj-sec'), z = sz[i]; if (!sv || !z || !z[0]) return; const hv = Math.max(300, Math.min(640, 400 * z[1] / z[0])); sv.setAttribute('viewBox', `0 ${Math.round((640 - hv) / 2)} 400 ${Math.round(hv)}`); });
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
    jukeFillMaps(cards, best);
    const cur = cards[best]; if (!cur || cur.classList.contains('xj-add')) return;
    exploreJukeId = cur.dataset.cid;
    const n = cards.filter(x => !x.classList.contains('xj-add')).length;
    const cnt = document.getElementById('xj-count'); if (cnt) cnt.textContent = `${best + 1} / ${n}`;
    const pf = document.getElementById('xj-posfill'); if (pf) pf.style.width = ((best + 1) / n * 100).toFixed(1) + '%';
    const chips = document.getElementById('xj-chips');
    if (chips) { const z = exploreZone || cur.dataset.zone; chips.querySelectorAll('.xj-chip').forEach(b => b.classList.toggle('xj-cur', !exploreZone && b.dataset.z === z));
      const on = [...chips.querySelectorAll('.xj-chip')].find(b => b.dataset.z === z);
      if (on && !exploreZone && !chips.classList.contains('xj-open')) { const t = on.offsetLeft - (chips.clientWidth - on.offsetWidth) / 2; if (Math.abs(chips.scrollLeft - t) > 4) chips.scrollTo({ left: Math.max(0, t), behavior: 'smooth' }); } }
  };
  track.addEventListener('scroll', () => { if (!_jukeRaf) _jukeRaf = requestAnimationFrame(update); }, { passive: true });
  jukeBindTips(track);
  if (!worldMap && typeof loadWorldMap === 'function') loadWorldMap().then(() => { if (document.body.contains(track)) update(); }).catch(() => {});

  // v9.04 · ordenador: rueda del ratón (una ficha por golpe), arrastrar con el ratón y flechas del teclado
  let wheelLock = 0;
  track.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;   // el gesto horizontal del trackpad ya desplaza solo
    e.preventDefault();
    const now = performance.now(); if (now < wheelLock) return;
    wheelLock = now + 280; jukeStep(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  let drag = null, moved = false;
  track.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.xj-edit, .xj-dt, .xj-tip')) return;
    drag = { x: e.clientX, sl: track.scrollLeft }; moved = false;
  });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!moved && Math.abs(dx) > 5) { moved = true; track.classList.add('xj-drag'); }
    if (moved) track.scrollLeft = drag.sl - dx;
  });
  const endDrag = () => {
    if (!drag) return; drag = null;
    if (moved) {
      track.classList.remove('xj-drag');
      jukeStep(0);   // se asienta en la ficha más cercana
      setTimeout(() => { moved = false; }, 0);
    }
  };
  window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
  track.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);   // un arrastre no abre el país
  if (!jukeInit.keyBound) {
    jukeInit.keyBound = true;
    document.addEventListener('keydown', e => {
      if (currentTab !== 'explorar' || exploreView !== 'jukebox' || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
      if (e.key === 'ArrowRight') { jukeStep(1); e.preventDefault(); } else if (e.key === 'ArrowLeft') { jukeStep(-1); e.preventDefault(); }
    });
  }
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
