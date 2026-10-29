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
  currentTab = tabName;
  ['album', 'indice', 'explorar'].forEach(t => {
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
