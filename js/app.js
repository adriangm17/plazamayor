/* ===== ARRANQUE, NAVEGACIÓN Y MENÚ ===== */
function toggleSettingsMenu(event) {
  event.stopPropagation();
  closeHeaderPop();
  updateBackupStatus();
  document.getElementById('settings-dropdown').classList.toggle('hidden');
}

// Ajustes: Información y Datos se despliegan dentro del propio menú
function toggleSetSub(which, event) {
  if (event) event.stopPropagation();
  ['info', 'data'].forEach(k => {
    const sub = document.getElementById('xm-sub-' + k), btn = sub && sub.previousElementSibling;
    const open = k === which && sub.classList.contains('hidden');
    sub.classList.toggle('hidden', !open);
    if (btn) { btn.classList.toggle('xm-open', open); btn.setAttribute('aria-expanded', open); }
  });
}

function confirmLogout() {
  if (!confirm('¿Cerrar sesión?')) return;
  if (!confirm('Segunda confirmación: se cerrará la sesión en este dispositivo.\n\n¿Seguro que quieres cerrar sesión?')) return;
  if (typeof PMSync !== 'undefined' && PMSync.enabled) PMSync.logout();
}

function closeSettingsMenu() {
  const menu = document.getElementById('settings-dropdown');
  if (menu) { menu.classList.add('hidden'); toggleSetSub(''); }
  closeHeaderPop();
}

/* ===== v8.04: botones de la cabecera según la pestaña, menús rápidos y cabecera/banner que se esconden al desplazar ===== */
function updateHeaderTools() {
  const inAlbum = currentTab === 'album' && !!countryById(currentCountryId);
  const set = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !on); };
  set('xh-addp', inAlbum);
  set('xh-editc', inAlbum);
  set('xh-newzone', currentTab === 'explorar');
  set('xh-sortzone', currentTab === 'explorar');
  set('xh-add', currentTab === 'album');
  closeHeaderPop();
}

function closeHeaderPop() {
  const pop = document.getElementById('xh-pop');
  if (pop) { pop.classList.add('hidden'); pop.innerHTML = ''; pop.dataset.kind = ''; }
}

// kind: 'periods' (+P: elegir época donde añadir moneda)
function toggleHeaderPop(kind, event) {
  if (event) event.stopPropagation();
  const pop = document.getElementById('xh-pop');
  if (!pop) return;
  if (!pop.classList.contains('hidden') && pop.dataset.kind === kind) { closeHeaderPop(); return; }
  const settings = document.getElementById('settings-dropdown'); if (settings) settings.classList.add('hidden');
  let html = '';
  if (kind === 'periods') {
    const country = countryById(currentCountryId);
    if (!country) return;
    const list = periodsByDate();
    html = `<p class="xh-pop-t">Añadir moneda a…</p>` + (list.length === 0
      ? `<p class="xh-pop-n">Este país aún no tiene períodos.</p>`
      : list.map(x => `<button type="button" onclick="closeHeaderPop(); openCreateModal('${jsArg(x.p.id)}')"><i class="fa-solid fa-coins"></i><span>${esc(periodDisplayName(x.p))}</span></button>`).join(''))
      + `<button type="button" class="xh-pop-sep" onclick="closeHeaderPop(); openAddPeriodModal('${jsArg(country.id)}')"><i class="fa-solid fa-plus"></i><span>Nuevo período</span></button>`;
  }
  pop.innerHTML = html;
  pop.dataset.kind = kind;
  pop.classList.remove('hidden');
  pop.scrollTop = 0;
}

/* Cabecera global: se esconde al bajar y solo vuelve al llegar arriba del todo o al cambiar de pestaña.
   Banner del Álbum: al bajar se comprime a una línea (bandera · buscador · épocas) y se queda fijo; al subir recupera su forma. */
const BarScroll = { y: 0, up: 0, hdrHidden: false, compact: false, freezeUntil: 0 };
function setHeaderHidden(hide) {
  if (BarScroll.hdrHidden === hide) return;
  BarScroll.hdrHidden = hide;
  const h = document.querySelector('header.xh-bar');
  if (h) h.classList.toggle('xh-hide', hide);
  if (hide) { closeHeaderPop(); closeSettingsMenu(); }
}
function setAlbumCompact(on) {
  if (BarScroll.compact === on) return;
  BarScroll.compact = on;
  const bar = document.getElementById('period-bar');
  if (bar) bar.classList.toggle('xa-compact', on);
  const w = document.querySelector('.xa-barwrap'); if (w) w.classList.toggle('xa-wc', on);
  updateAlbumBarVars();
}
// El hueco que ocupa el banner en la página se mantiene fijo (tamaño expandido) para que al comprimirlo no salte el contenido
function updateAlbumBarVars() {
  const wrap = document.querySelector('.xa-barwrap'), bar = document.getElementById('period-bar');
  if (!wrap || !bar) return;
  if (!BarScroll.compact) wrap.style.height = bar.offsetHeight ? bar.offsetHeight + 'px' : '';
  wrap.style.setProperty('--bh', (bar.offsetHeight + (BarScroll.compact ? 6 : 0)) + 'px');
}
function resetBarScroll() {
  BarScroll.y = Math.max(0, window.scrollY || 0); BarScroll.up = 0;
  setHeaderHidden(false);
  setAlbumCompact(false);
}
function onBarScroll() {
  const y = Math.max(0, window.scrollY || 0), dy = y - BarScroll.y;
  BarScroll.y = y;
  if (y <= 4) { setHeaderHidden(false); setAlbumCompact(false); BarScroll.up = 0; return; }
  if (dy > 0) {
    BarScroll.up = 0;
    if (y > 40) setHeaderHidden(true);
    if (currentTab === 'album' && y > 70 && performance.now() > BarScroll.freezeUntil) setAlbumCompact(true);
  }   // v8.05: el banner compacto solo recupera su forma completa al llegar arriba del todo (y <= 4)
}
window.addEventListener('scroll', onBarScroll, { passive: true });
window.addEventListener('resize', updateAlbumBarVars);

// Limpia los filtros de TODAS las pestañas (así, al volver, no parece que falten monedas)
function resetAllFilters() {
  if (typeof resetAlbumFilters === 'function') resetAlbumFilters();
  if (typeof statsGrade !== 'undefined') { statsGrade = ''; statsType = ''; statsTypeHave = false; statsErrors = false; statsGradePage = 1; statsNoYearOpen = false; statsRange = null; }
  indiceSearchText = '';
  const is = document.getElementById('indice-search'); if (is) is.value = '';
  if (typeof exploreSearch !== 'undefined') exploreSearch = '';
  if (typeof exploreContinent !== 'undefined') exploreContinent = '';
  const es = document.getElementById('explorar-search'); if (es) es.value = '';
}

// v8.05: al cambiar de pestaña (o de país) no se recuerda nada plegado: Álbum y Explorar todo desplegado; Índice siempre contraído
function expandAlbumPeriods() {
  periodsOfCountry(currentCountryId).forEach(p => { p.collapsed = false; periodForceOpen[p.id] = true; });
}
function resetViewFolds(tabName) {
  if (tabName === 'indice') indiceCollapsedCountries = {};
  else if (tabName === 'explorar') { Object.keys(exploreClosed).forEach(k => delete exploreClosed[k]); exploreAddZone = ''; }
  else if (tabName === 'album') expandAlbumPeriods();
}

function switchTab(tabName) {
  if (tabName === 'estadisticas' && currentTab === 'estadisticas' && typeof statsGrade !== 'undefined') { statsGrade = ''; statsType = ''; statsTypeHave = false; statsErrors = false; }   // tocar de nuevo la pestaña vuelve al resumen
  if (tabName !== currentTab) resetAllFilters();   // al cambiar de pestaña no se mantiene ningún filtro
  if (tabName !== currentTab) { resetBarScroll(); resetViewFolds(tabName); }    // v8.04: al cambiar de pestaña la cabecera vuelve a verse
  showTab(tabName);
  render();
}

function showTab(tabName) {
  if (currentTab === 'identificar' && tabName !== 'identificar' && typeof identReset === 'function') identReset();   // las fotos de Identificación no se conservan al cambiar de pestaña
  currentTab = tabName;
  document.body.classList.toggle('theme-explorar', tabName === 'explorar' || tabName === 'estadisticas' || tabName === 'indice' || tabName === 'album' || tabName === 'identificar');
  ['album', 'indice', 'explorar', 'estadisticas', 'identificar'].forEach(t => {
    const view = document.getElementById(`view-${t}`);
    const btn = document.getElementById(`nav-btn-${t}`);
    if (t === tabName) {
      view.classList.remove('hidden');
      btn.className = "xn-btn xn-on";
    } else {
      view.classList.add('hidden');
      btn.className = "xn-btn";
    }
  });
}

function render() {
  if (currentTab === 'album') {
    renderTabs();
    renderSections();
  } else if (currentTab === 'indice') {
    renderIndiceView();
  } else if (currentTab === 'explorar') {
    renderExplorar();
  } else if (currentTab === 'estadisticas') {
    renderEstadisticas();
  } else if (currentTab === 'identificar') {
    renderIdentificar();
  }
  updateHeaderTools();
  updateAlbumBarVars();
  if (typeof navSync === 'function') navSync();
}

function setupPWA() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

window.addEventListener('click', closeSettingsMenu);
window.addEventListener('DOMContentLoaded', () => {
  updateBackupStatus();
  setupImageDropzones();
  switchTab('indice');
  const startApp = () => Promise.resolve(loadData()).catch(() => {}).then(() => navInit());
  if (typeof PMSync !== 'undefined' && PMSync.enabled) PMSync.boot(startApp); else startApp();   // v8.03: con la nube configurada, primero el acceso con cuenta
  setupPWA();
  const pb = document.getElementById('period-bar');
  if (pb && window.ResizeObserver) new ResizeObserver(updateAlbumBarVars).observe(pb);
});
