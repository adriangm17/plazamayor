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
  if (typeof statsGrade !== 'undefined') { statsGrade = ''; statsType = ''; statsGradePage = 1; statsNoYearOpen = false; statsRange = null; }
  indiceSearchText = '';
  const is = document.getElementById('indice-search'); if (is) is.value = '';
  if (typeof exploreSearch !== 'undefined') exploreSearch = '';
  const es = document.getElementById('explorar-search'); if (es) es.value = '';
}

function switchTab(tabName) {
  if (tabName === 'estadisticas' && currentTab === 'estadisticas' && typeof statsGrade !== 'undefined') { statsGrade = ''; statsType = ''; }   // tocar de nuevo la pestaña vuelve al resumen
  if (tabName !== currentTab) resetAllFilters();   // al cambiar de pestaña no se mantiene ningún filtro
  showTab(tabName);
  render();
}

function showTab(tabName) {
  currentTab = tabName;
  document.body.classList.toggle('theme-explorar', tabName === 'explorar' || tabName === 'estadisticas' || tabName === 'indice' || tabName === 'album');
  ['album', 'indice', 'explorar', 'estadisticas'].forEach(t => {
    const view = document.getElementById(`view-${t}`);
    const btn = document.getElementById(`nav-btn-${t}`);
    if (t === tabName) {
      view.classList.remove('hidden');
      btn.className = "flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition text-amber-400 bg-slate-800/60 font-bold";
    } else {
      view.classList.add('hidden');
      btn.className = "flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition text-slate-400 hover:text-white";
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
  Promise.resolve(loadData()).catch(() => {}).then(() => navInit());
  setupPWA();
});
