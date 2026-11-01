/* ===== ARRANQUE, NAVEGACIÓN Y MENÚ ===== */
function toggleSettingsMenu(event) {
  event.stopPropagation();
  document.getElementById('settings-dropdown').classList.toggle('hidden');
}

function closeSettingsMenu() {
  const menu = document.getElementById('settings-dropdown');
  if (menu) menu.classList.add('hidden');
}

function switchTab(tabName) {
  if (tabName === 'estadisticas' && currentTab === 'estadisticas' && typeof statsGrade !== 'undefined') { statsGrade = ''; statsType = ''; }   // tocar de nuevo la pestaña vuelve al resumen
  if (tabName !== currentTab && typeof resetAlbumFilters === 'function') resetAlbumFilters();   // al cambiar de pestaña se limpian los filtros del Álbum
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
  render();
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
  loadData();
  setupPWA();
});
