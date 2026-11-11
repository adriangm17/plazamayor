/* ===== ARRANQUE, NAVEGACIÓN Y MENÚ ===== */
function toggleSettingsMenu(event) {
  event.stopPropagation();
  document.getElementById('settings-dropdown').classList.toggle('hidden');
}

function closeSettingsMenu() {
  const menu = document.getElementById('settings-dropdown');
  if (menu) menu.classList.add('hidden');
}

// Limpia los filtros de TODAS las pestañas (así, al volver, no parece que falten monedas)
function resetAllFilters() {
  if (typeof resetAlbumFilters === 'function') resetAlbumFilters();
  if (typeof statsGrade !== 'undefined') { statsGrade = ''; statsType = ''; statsTypeHave = false; statsGradePage = 1; statsNoYearOpen = false; statsRange = null; }
  indiceSearchText = '';
  const is = document.getElementById('indice-search'); if (is) is.value = '';
  if (typeof exploreSearch !== 'undefined') exploreSearch = '';
  if (typeof exploreContinent !== 'undefined') exploreContinent = '';
  const es = document.getElementById('explorar-search'); if (es) es.value = '';
}

function switchTab(tabName) {
  if (tabName === 'estadisticas' && currentTab === 'estadisticas' && typeof statsGrade !== 'undefined') { statsGrade = ''; statsType = ''; statsTypeHave = false; }   // tocar de nuevo la pestaña vuelve al resumen
  if (tabName !== currentTab) resetAllFilters();   // al cambiar de pestaña no se mantiene ningún filtro
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
});
