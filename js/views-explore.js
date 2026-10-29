/* ===== VISTA EXPLORAR: zonas geográficas (propias y predefinidas) y nube de etiquetas ===== */
const BUILTIN_ZONES = ['Europa', 'América', 'Asia', 'África', 'Oceanía'];
const UNCLASSIFIED = 'Sin clasificar';
const CONTINENT_ICON = { 'Europa': 'earth-europe', 'América': 'earth-americas', 'Asia': 'earth-asia', 'África': 'earth-africa', 'Oceanía': 'earth-oceania', [UNCLASSIFIED]: 'circle-question' };

const CONTINENT_COUNTRIES = {
  'Europa': 'espana,portugal,francia,italia,alemania,austria,suiza,belgica,paises bajos,holanda,luxemburgo,reino unido,gran bretana,inglaterra,escocia,irlanda,islandia,noruega,suecia,finlandia,dinamarca,polonia,chequia,republica checa,checoslovaquia,eslovaquia,hungria,rumania,bulgaria,grecia,albania,yugoslavia,serbia,croacia,eslovenia,bosnia,montenegro,macedonia,kosovo,moldavia,ucrania,bielorrusia,rusia,urss,estonia,letonia,lituania,malta,chipre,andorra,monaco,san marino,vaticano,liechtenstein,gibraltar,rda,union sovietica,prusia,imperio ruso,imperio austrohungaro,sacro imperio romano,imperio romano',
  'América': 'estados unidos,eeuu,usa,canada,mexico,guatemala,belice,honduras,el salvador,nicaragua,costa rica,panama,cuba,haiti,republica dominicana,jamaica,bahamas,barbados,trinidad y tobago,puerto rico,colombia,venezuela,ecuador,peru,bolivia,chile,argentina,uruguay,paraguay,brasil,guyana,surinam,groenlandia,caribe oriental',
  'Asia': 'china,japon,corea,india,pakistan,banglades,sri lanka,nepal,butan,birmania,myanmar,tailandia,vietnam,laos,camboya,malasia,singapur,indonesia,filipinas,brunei,taiwan,hong kong,macao,mongolia,kazajistan,uzbekistan,turkmenistan,kirguistan,tayikistan,afganistan,iran,irak,siria,libano,israel,jordania,arabia saudi,arabia saudita,yemen,oman,emiratos arabes,catar,qatar,bahrein,kuwait,turquia,georgia,armenia,azerbaiyan,maldivas,palestina',
  'África': 'egipto,libia,tunez,argelia,marruecos,sudan,etiopia,eritrea,somalia,yibuti,kenia,uganda,tanzania,ruanda,burundi,congo,zaire,angola,zambia,zimbabue,rodesia,mozambique,malaui,madagascar,mauricio,seychelles,namibia,botsuana,sudafrica,suazilandia,esuatini,lesoto,nigeria,ghana,costa de marfil,senegal,mali,niger,chad,camerun,gabon,guinea,sierra leona,liberia,togo,benin,burkina faso,mauritania,gambia,cabo verde,santo tome,comoras,centroafricana,sahara',
  'Oceanía': 'australia,nueva zelanda,papua,fiyi,samoa,tonga,vanuatu,islas salomon,kiribati,tuvalu,nauru,palaos'
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
  renderExplorar();
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

let exploreMode = 'continentes';
let exploreTag = '';
let exploreAddZone = '';   // zona cuyo selector de países está abierto
const exploreClosed = {};

function setExploreMode(m) { exploreMode = m; renderExplorar(); }
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
function selectCloudTag(tag) { exploreTag = (exploreTag === tag) ? '' : tag; renderExplorar(); }

function countryStats(c) {
  const normal = coinsOfCountry(c.id).filter(x => !isSilverCoin(x));
  const a = normal.filter(x => x.acquired).length;
  return { a, t: normal.length, pct: normal.length ? Math.round(a / normal.length * 100) : 0 };
}

function renderExplorar() {
  const box = document.getElementById('explorar-content');
  if (!box) return;
  const on = 'bg-amber-500 text-slate-950 border-amber-400', off = 'bg-slate-900 text-slate-300 border-slate-800';
  document.getElementById('explore-btn-continentes').className = `flex-1 py-2 rounded-xl text-[11px] font-bold border transition ${exploreMode === 'continentes' ? on : off}`;
  document.getElementById('explore-btn-nube').className = `flex-1 py-2 rounded-xl text-[11px] font-bold border transition ${exploreMode === 'nube' ? on : off}`;
  if (countries.length === 0) { box.innerHTML = `<div class="text-center py-10 text-gray-500 text-xs">Aún no hay países en la colección.</div>`; return; }
  box.innerHTML = exploreMode === 'nube' ? renderTagCloud() : renderContinents();
}

function renderContinents() {
  const zones = allZones();
  const groups = {};
  sortedCountries().forEach(c => { (groups[continentOf(c)] ||= []).push(c); });
  // Las zonas predefinidas vacías no se muestran; las propias sí, para poder llenarlas
  const order = [...zones, UNCLASSIFIED].filter(k => groups[k] || !BUILTIN_ZONES.includes(k) && k !== UNCLASSIFIED);

  const adder = `
    <div class="flex gap-2">
      <input type="text" id="new-zone-name" maxlength="40" placeholder="Nueva zona geográfica (ej: Balcanes, Caribe…)" onkeydown="if(event.key==='Enter')addZone()" class="flex-1 bg-slate-900 text-white text-xs px-3 py-2.5 rounded-xl border border-slate-800 outline-none focus:border-amber-500">
      <button onclick="addZone()" class="shrink-0 px-3 py-2.5 bg-amber-500 text-slate-950 rounded-xl text-[11px] font-bold"><i class="fa-solid fa-plus mr-1"></i> Añadir zona</button>
    </div>`;

  const expandBar = `
    <div class="flex justify-end gap-1">
      <button onclick="expandAllZones()" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] text-slate-300 font-bold transition flex items-center gap-1"><i class="fa-solid fa-angles-down text-amber-400"></i> Expandir</button>
      <button onclick="collapseAllZones()" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] text-slate-300 font-bold transition flex items-center gap-1"><i class="fa-solid fa-angles-up text-slate-400"></i> Contraer</button>
    </div>`;

  const cards = order.map(cont => {
    const list = (groups[cont] || []).map(c => ({ c, s: countryStats(c) }));
    const a = list.reduce((m, x) => m + x.s.a, 0), t = list.reduce((m, x) => m + x.s.t, 0);
    const pct = t ? Math.round(a / t * 100) : 0;
    const closed = exploreClosed[cont];
    const isBuiltin = BUILTIN_ZONES.includes(cont), isUncl = cont === UNCLASSIFIED;
    const icon = CONTINENT_ICON[cont] || 'location-dot';
    const others = [...countries].sort((x, y) => x.name.localeCompare(y.name, 'es', { sensitivity: 'base' })).filter(c => continentOf(c) !== cont);
    return `
      <div class="bg-[#141b2a] border ${isUncl ? 'border-amber-500/40' : 'border-slate-800/80'} rounded-2xl p-3.5 shadow-lg space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onclick="toggleExploreContinent('${jsArg(cont)}')">
            <i class="fa-solid fa-${icon} text-amber-400 text-lg w-6 text-center"></i>
            <div class="min-w-0">
              <h3 class="text-base font-bold text-white font-serif-numis truncate">${esc(cont)}</h3>
              <p class="text-[11px] text-slate-400">${list.length} ${list.length === 1 ? 'país' : 'países'} · ${a} de ${t} monedas (${pct}%)</p>
            </div>
          </div>
          ${!isUncl ? `<button onclick="toggleAddCountry('${jsArg(cont)}')" class="${exploreAddZone === cont ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'} px-1" title="Añadir un país a esta zona"><i class="fa-solid fa-plus text-[11px]"></i></button>` : ''}
          ${(!isBuiltin && !isUncl) ? `
            <button onclick="renameZone('${jsArg(cont)}')" class="text-slate-500 hover:text-amber-400 px-1" title="Renombrar zona"><i class="fa-solid fa-pen text-[10px]"></i></button>
            <button onclick="deleteZone('${jsArg(cont)}')" class="text-slate-500 hover:text-red-400 px-1" title="Eliminar zona"><i class="fa-solid fa-trash text-[10px]"></i></button>` : ''}
          <i class="fa-solid fa-chevron-${closed ? 'right' : 'down'} text-xs text-amber-400 cursor-pointer" onclick="toggleExploreContinent('${jsArg(cont)}')"></i>
        </div>
        <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-amber-500" style="width:${pct}%"></div></div>
        ${exploreAddZone === cont ? `
          <div class="bg-slate-900 border border-amber-500/40 rounded-xl overflow-hidden">
            <p class="px-3 py-1.5 text-[10px] text-amber-400 font-bold uppercase tracking-wider border-b border-slate-800">Añadir a ${esc(cont)}</p>
            <div class="max-h-48 overflow-y-auto">
              ${others.length === 0 ? `<p class="px-3 py-2 text-[11px] text-slate-500">No hay más países para añadir.</p>` : others.map(c => `
                <button onclick="addCountryToZone('${jsArg(c.id)}', '${jsArg(cont)}')" class="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 border-b border-slate-800/60 last:border-0 flex justify-between gap-2">
                  <span class="truncate flex items-center gap-2">${flagChip(c, 20, 14)}${esc(c.name)}</span><span class="text-[10px] text-slate-500 shrink-0">${esc(continentOf(c))}</span>
                </button>`).join('')}
            </div>
          </div>` : ''}
        <div class="space-y-1.5 pt-1 ${closed ? 'hidden' : ''}">
          ${list.length === 0 ? `<p class="text-[11px] text-slate-500 italic">Todavía no hay países en esta zona.</p>` : ''}
          ${list.map(({ c, s }) => `
            <div class="bg-[#182132] border border-slate-800 rounded-xl p-2 flex items-center gap-2.5">
              ${flagChip(c, 28, 19)}
              <div class="flex-1 min-w-0 cursor-pointer flex items-center justify-between gap-2" onclick="jumpToCountry('${jsArg(c.id)}')">
                <span class="text-xs font-bold text-slate-200 truncate hover:text-amber-400">${esc(c.name)}</span>
                <span class="text-[11px] font-black text-amber-400 shrink-0" title="${s.a} de ${s.t} monedas">${s.pct}%</span>
              </div>
              ${isUncl
                ? `<select onchange="setCountryContinent('${jsArg(c.id)}', this.value)" class="bg-slate-900 text-slate-200 text-[10px] p-1.5 rounded-lg border border-amber-500/50 max-w-[150px]"><option value="">Elegir zona…</option>${zones.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select>`
                : `<button onclick="editCountryFromIndice('${jsArg(c.id)}')" class="text-slate-500 hover:text-amber-400 px-1" title="Cambiar zona / etiquetas"><i class="fa-solid fa-pen text-[10px]"></i></button>`}
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
  return adder + expandBar + cards;
}

function renderTagCloud() {
  const tags = {};
  const slot = t => (tags[t] ||= { c: [], p: [], ids: new Set() });
  countries.forEach(c => (c.tags || []).forEach(t => { const e = slot(t); e.c.push(c); coinsOfCountry(c.id).forEach(x => e.ids.add(x.id)); }));
  periods.forEach(p => (p.tags || []).forEach(t => { const e = slot(t); e.p.push(p); coinsOfPeriod(p.id).forEach(x => e.ids.add(x.id)); }));
  const names = Object.keys(tags).sort();
  const untagged = sortedCountries().filter(c => !(c.tags || []).length && !periodsOfCountry(c.id).some(p => (p.tags || []).length));

  if (names.length === 0) {
    return `<div class="text-center py-10 text-gray-500 text-xs">Aún no hay etiquetas. Añade algunas (#EUROPA, #EURO, #SIGLOXX…) desde el lápiz de cada país o período.</div>`;
  }
  if (exploreTag && !tags[exploreTag]) exploreTag = '';
  const max = Math.max(...names.map(n => tags[n].ids.size), 1);
  const cloud = names.map(n => {
    const w = tags[n].ids.size / max;
    const size = 11 + Math.round(w * 17);
    const sel = exploreTag === n;
    return `<button onclick="selectCloudTag('${jsArg(n)}')" style="font-size:${size}px;opacity:${(0.55 + w * 0.45).toFixed(2)}" class="px-2.5 py-1 rounded-xl font-black font-serif-numis border transition ${sel ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-900 text-amber-400 border-slate-800 hover:border-amber-500'}" title="${tags[n].ids.size} monedas">${esc(n)}</button>`;
  }).join('');

  let detail = '';
  if (exploreTag) {
    const e = tags[exploreTag];
    detail = `
      <div class="bg-[#141b2a] border border-amber-500/40 rounded-2xl p-3.5 space-y-2">
        <h3 class="text-sm font-bold text-white">${esc(exploreTag)} <span class="text-[11px] text-slate-400 font-normal">· ${e.ids.size} monedas</span></h3>
        ${e.c.map(c => `<div onclick="jumpToCountry('${jsArg(c.id)}')" class="bg-[#182132] hover:bg-slate-800 border border-slate-800 rounded-xl p-2 text-xs font-bold text-slate-200 cursor-pointer flex items-center gap-2">${flagChip(c, 22, 15)}${esc(c.name)}</div>`).join('')}
        ${e.p.map(p => `<div onclick="jumpToPeriod('${jsArg(p.id)}')" class="bg-[#182132] hover:bg-slate-800 border border-slate-800 rounded-xl p-2 text-xs text-slate-300 cursor-pointer"><i class="fa-solid fa-circle text-[6px] text-amber-400 mr-1.5 align-middle"></i>${esc((countryById(p.countryId) || {}).name || '')} · ${esc(periodDisplayName(p))}</div>`).join('')}
      </div>`;
  }

  const pending = untagged.length ? `
      <div class="bg-[#141b2a] border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
        <p class="text-[11px] text-slate-400"><i class="fa-solid fa-tag text-amber-400 mr-1"></i>${untagged.length} ${untagged.length === 1 ? 'país sin etiquetas' : 'países sin etiquetas'} (toca para etiquetar):</p>
        <div class="flex flex-wrap gap-1.5">${untagged.map(c => `<button onclick="editCountryFromIndice('${jsArg(c.id)}')" class="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-900 text-slate-300 border border-slate-800 hover:border-amber-500">${esc(c.name)}</button>`).join('')}</div>
      </div>` : '';

  return `<div class="flex flex-wrap gap-2 items-center justify-center py-3 px-1 bg-[#151c2c] border border-slate-800 rounded-2xl">${cloud}</div>${detail}${pending}`;
}
