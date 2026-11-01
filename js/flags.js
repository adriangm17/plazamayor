/* ===== BANDERAS =====
   Cada país se asocia a su bandera por el nombre (igual que la zona geográfica) o por un código ISO
   que el usuario puede fijar a mano (country.flag). Las imágenes son SVG de la librería flag-icons (cdnjs).
   Si la imagen no carga (sin conexión) o el país no tiene bandera actual (URSS, RDA…), se pinta un degradado
   con los colores de la bandera: las capas de fondo CSS hacen de "plan B" sin necesidad de JavaScript. */
const FLAG_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/flag-icons/7.0.0/flags/4x3/';
const FLAG_DEFAULT_BG = 'linear-gradient(135deg,#475569,#1e293b)';
const FLAG_CODE_RE = /^[a-z]{2}(-[a-z]{2,3})?$/;

const FLAG_CODES_RAW = [
  // Europa
  'espana:es,portugal:pt,francia:fr,italia:it,alemania:de,alemania occidental:de,rfa:de,austria:at,suiza:ch,belgica:be,paises bajos:nl,holanda:nl,luxemburgo:lu,reino unido:gb,gran bretana:gb,inglaterra:gb-eng,escocia:gb-sct,gales:gb-wls,irlanda del norte:gb-nir,irlanda:ie,islandia:is,noruega:no,suecia:se,finlandia:fi,dinamarca:dk,polonia:pl,chequia:cz,republica checa:cz,eslovaquia:sk,hungria:hu,rumania:ro,bulgaria:bg,grecia:gr,albania:al,serbia:rs,croacia:hr,eslovenia:si,bosnia:ba,montenegro:me,macedonia del norte:mk,macedonia:mk,kosovo:xk,moldavia:md,ucrania:ua,bielorrusia:by,rusia:ru,estonia:ee,letonia:lv,lituania:lt,malta:mt,chipre:cy,andorra:ad,monaco:mc,san marino:sm,vaticano:va,liechtenstein:li,gibraltar:gi,union europea:eu,eurozona:eu',
  // América
  'estados unidos:us,eeuu:us,usa:us,canada:ca,mexico:mx,guatemala:gt,belice:bz,honduras:hn,el salvador:sv,nicaragua:ni,costa rica:cr,panama:pa,cuba:cu,haiti:ht,republica dominicana:do,jamaica:jm,bahamas:bs,barbados:bb,trinidad y tobago:tt,puerto rico:pr,colombia:co,venezuela:ve,ecuador:ec,peru:pe,bolivia:bo,chile:cl,argentina:ar,uruguay:uy,paraguay:py,brasil:br,guyana:gy,surinam:sr,groenlandia:gl',
  // Asia
  'china:cn,japon:jp,corea del sur:kr,corea del norte:kp,corea:kr,india:in,pakistan:pk,banglades:bd,sri lanka:lk,nepal:np,butan:bt,birmania:mm,myanmar:mm,tailandia:th,vietnam:vn,laos:la,camboya:kh,malasia:my,singapur:sg,indonesia:id,filipinas:ph,brunei:bn,taiwan:tw,hong kong:hk,macao:mo,mongolia:mn,kazajistan:kz,uzbekistan:uz,turkmenistan:tm,kirguistan:kg,tayikistan:tj,afganistan:af,iran:ir,irak:iq,siria:sy,libano:lb,israel:il,jordania:jo,arabia saudi:sa,arabia saudita:sa,yemen:ye,oman:om,emiratos arabes:ae,catar:qa,qatar:qa,bahrein:bh,kuwait:kw,turquia:tr,georgia:ge,armenia:am,azerbaiyan:az,maldivas:mv,palestina:ps',
  // África
  'egipto:eg,libia:ly,tunez:tn,argelia:dz,marruecos:ma,sudan del sur:ss,sudan:sd,etiopia:et,eritrea:er,somalia:so,yibuti:dj,kenia:ke,uganda:ug,tanzania:tz,ruanda:rw,burundi:bi,republica democratica del congo:cd,congo:cg,angola:ao,zambia:zm,zimbabue:zw,mozambique:mz,malaui:mw,madagascar:mg,mauricio:mu,seychelles:sc,namibia:na,botsuana:bw,sudafrica:za,suazilandia:sz,esuatini:sz,lesoto:ls,nigeria:ng,ghana:gh,costa de marfil:ci,senegal:sn,mali:ml,niger:ne,chad:td,camerun:cm,gabon:ga,guinea ecuatorial:gq,guinea bisau:gw,guinea bissau:gw,guinea:gn,sierra leona:sl,liberia:lr,togo:tg,benin:bj,burkina faso:bf,mauritania:mr,gambia:gm,cabo verde:cv,santo tome:st,comoras:km,centroafricana:cf,sahara:eh',
  // Oceanía
  'australia:au,nueva zelanda:nz,papua nueva guinea:pg,papua:pg,fiyi:fj,samoa:ws,tonga:to,vanuatu:vu,islas salomon:sb,kiribati:ki,tuvalu:tv,nauru:nr,palaos:pw'
].join(',');

// Estados históricos sin bandera actual: se pintan con los colores de la suya
const FLAG_HISTORIC = {
  'urss,union sovietica': ['#c8102e', '#ffd100'],
  'yugoslavia': ['#0c4076', '#ffffff', '#c6363c'],
  'checoslovaquia': ['#ffffff', '#d7141a', '#11457e'],
  'rda,alemania oriental': ['#000000', '#dd0000', '#ffce00'],
  'rodesia': ['#00793d', '#ffffff', '#00793d'],
  'zaire': ['#1e8a3c', '#f7d118'],
  'austria hungria,imperio austrohungaro': ['#000000', '#ffcc00'],
  'imperio otomano': ['#e30a17', '#ffffff'],
  'prusia': ['#000000', '#ffffff'],
  'imperio romano': ['#8b0000', '#d4af37'],
  'sacro imperio romano': ['#000000', '#ffd700'],
  'imperio ruso': ['#ffffff', '#0039a6', '#d52b1e']
};

function flagNorm(s) { return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-–—_]+/g, ' ').replace(/\s+/g, ' ').trim(); }   // "Austria-Hungría" = "austria hungria"

// Claves ordenadas de más larga a más corta: "alemania oriental" gana a "alemania"
const FLAG_KEYS = (() => {
  const list = [];
  FLAG_CODES_RAW.split(',').forEach(p => { const i = p.lastIndexOf(':'); list.push({ key: p.slice(0, i), code: p.slice(i + 1) }); });
  Object.entries(FLAG_HISTORIC).forEach(([keys, colors]) => keys.split(',').forEach(k => list.push({ key: k, colors })));
  return list.sort((a, b) => b.key.length - a.key.length).map(e => ({ ...e, re: new RegExp('(^|[^a-z])' + e.key + '([^a-z]|$)') }));
})();
const _flagCache = {};

function flagLookup(name) {
  const n = flagNorm(name);
  if (_flagCache[n] === undefined) _flagCache[n] = FLAG_KEYS.find(e => e.re.test(n)) || {};
  return _flagCache[n];
}

function flagCode(country) {
  const own = String(country.flag || '').trim().toLowerCase();
  if (FLAG_CODE_RE.test(own)) return own;
  return flagLookup(country.name).code || '';
}

function flagStripes(colors) {
  const n = colors.length;
  return `linear-gradient(90deg,${colors.map((c, i) => `${c} ${(i * 100 / n).toFixed(1)}% ${((i + 1) * 100 / n).toFixed(1)}%`).join(',')})`;
}

// Capas de fondo: imagen de la bandera y, debajo, el degradado de respaldo
function flagLayers(country) {
  const code = flagCode(country);
  const fallbackOnly = () => {
    const c = flagLookup(country.name).colors;
    return c ? flagStripes(c) : FLAG_DEFAULT_BG;
  };
  // Imagen propia del usuario: manda sobre el código y sobre la detección automática
  if (typeof country.flagImage === 'string' && country.flagImage.startsWith('data:image/')) {
    return `url('${country.flagImage}') center/cover no-repeat,${fallbackOnly()}`;
  }
  const own = FLAG_CODE_RE.test(String(country.flag || '').trim().toLowerCase());
  const colors = !own && flagLookup(country.name).colors;
  const fallback = colors ? flagStripes(colors) : FLAG_DEFAULT_BG;
  return code ? `url('${FLAG_BASE}${code}.svg') center/cover no-repeat,${fallback}` : fallback;
}

// Banner del Índice: bandera de fondo con velo oscuro a la izquierda para que el texto se lea
function flagBanner(country) {
  return `linear-gradient(90deg,rgba(20,27,42,.96) 0%,rgba(20,27,42,.80) 45%,rgba(20,27,42,.28) 100%),${flagLayers(country)}`;
}

// Franja del Álbum: la bandera solo como tinte suave
function flagTint(country) {
  return `linear-gradient(90deg,rgba(21,28,44,.94) 0%,rgba(21,28,44,.74) 100%),${flagLayers(country)}`;
}

// Bandera pequeña con borde fino
function flagChip(country, w = 24, h = 16) {
  return `<span class="inline-block shrink-0" style="width:${w}px;height:${h}px;border-radius:3px;background:${flagLayers(country)};box-shadow:0 0 0 1px rgba(255,255,255,.14)"></span>`;
}

// Imagen propia pendiente de guardar en la ventana "Editar país": undefined = sin cambios, '' = quitar, 'data:…' = nueva
let pendingFlagImage;

function currentFlagImage(country) {
  return pendingFlagImage !== undefined ? pendingFlagImage : (country.flagImage || '');
}

// Vista previa en la ventana "Editar país"
function updateFlagPreview() {
  const country = countryById(currentCountryId);
  const box = document.getElementById('flag-edit-preview');
  if (!country || !box) return;
  const img = currentFlagImage(country);
  box.innerHTML = flagChip({ name: country.name, flag: document.getElementById('input-edit-country-flag').value, flagImage: img }, 36, 24);
  const label = document.getElementById('flag-image-label');
  if (label) label.innerText = img ? 'Usando tu imagen' : '';
}

function onFlagFileSelected(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('Elige un archivo de imagen.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const MAX = 400;
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      const k = Math.min(1, MAX / Math.max(w0, h0));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w0 * k));
      canvas.height = Math.max(1, Math.round(h0 * k));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      let url = canvas.toDataURL('image/webp', 0.8);
      if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.85);   // navegadores sin WebP
      pendingFlagImage = url;
      updateFlagPreview();
    };
    img.onerror = () => alert('No se pudo leer la imagen.');
    img.src = e.target.result;
  };
  reader.onerror = () => alert('No se pudo leer el archivo.');
  reader.readAsDataURL(file);
}

function clearFlagImage() {
  pendingFlagImage = '';
  updateFlagPreview();
}
