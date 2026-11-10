/* ===== BOTÓN "ATRÁS" DEL MÓVIL / NAVEGADOR =====
   Cada paso de navegación (abrir una ficha o ventana, elegir país, período o grupo, activar un filtro,
   abrir un estado en Estadísticas, cambiar de pestaña) queda en el historial del navegador.
   Así, "atrás" deshace el último paso en vez de cerrar la app; solo se sale de la app desde el Índice.
   Funciona por "fotos" del estado: cuando la foto cambia se añade una entrada al historial; si vuelve a ser
   igual que la anterior (p. ej. se cierra la ficha con su botón) se retrocede una entrada en vez de añadir otra. */
const NAV_MODALS = ['periods-overlay', 'coin-modal', 'variants-modal', 'create-modal', 'edit-period-modal', 'edit-zone-modal', 'edit-country-modal', 'import-modal', 'theme-modal', 'options-modal'];
const NAV_CLOSERS = {
  'periods-overlay': () => closePeriodsOverlay(),
  'coin-modal': () => closeModal(),
  'variants-modal': () => closeVariantsSheet(),
  'create-modal': () => closeCreateModal(),
  'edit-period-modal': () => closeEditPeriodModal(),
  'edit-zone-modal': () => closeEditZoneModal(),
  'edit-country-modal': () => closeEditCountryModal(),
  'import-modal': () => closeImportModal(),
  'theme-modal': () => closeThemeModal(),
  'options-modal': () => closeOptionsModal()
};
let navReady = false, navSnaps = [], navIdx = 0, navPending = 0, navTimer = 0, navPendingTimer = 0;

function navOpenModals() {
  return NAV_MODALS.filter(id => { const e = document.getElementById(id); return e && !e.classList.contains('hidden'); });
}

function navSnap() {
  const s = { t: currentTab, m: navOpenModals() };
  if (currentTab === 'album') {
    s.c = currentCountryId || ''; s.p = albumPeriodId || ''; s.g = albumGroup || '';
    s.f = [albumOnlyMissing, albumOnlyOwned, albumOnlySpecial].map(Number).join('') + '|' +
      Object.keys(periodOnlyMissing).filter(k => periodOnlyMissing[k]).sort().join(',');
  } else if (currentTab === 'explorar') {
    s.xc = (typeof exploreContinent !== 'undefined' && exploreContinent) || '';
  } else if (currentTab === 'estadisticas') {
    s.sg = statsGrade; s.st = statsType; s.sh = statsTypeHave;
  }
  return s;
}
const navBase = s => JSON.stringify({ ...s, m: 0 });
const navKey = s => JSON.stringify(s);
const navStrictSuperset = (big, small) => big.length > small.length && small.every(x => big.includes(x));

function navSync() {
  if (!navReady) return;
  clearTimeout(navTimer);
  navTimer = setTimeout(navCommit, 0);   // agrupa varios cambios del mismo instante en un solo paso
}

function navCommit() {
  if (navPending > 0) { navTimer = setTimeout(navCommit, 30); return; }   // hay un "atrás" en camino: se espera
  const cur = navSnaps[navIdx], now = navSnap();
  if (navKey(now) === navKey(cur)) return;
  if (navIdx > 0 && navKey(now) === navKey(navSnaps[navIdx - 1])) {   // se ha vuelto al paso anterior: se retrocede
    navIdx--; navPending++;
    clearTimeout(navPendingTimer); navPendingTimer = setTimeout(() => { navPending = 0; }, 700);
    history.back();
    return;
  }
  if (navBase(now) === navBase(cur) && cur.m.length && now.m.length && !navStrictSuperset(now.m, cur.m)) {
    navSnaps[navIdx] = now;   // una ventana se cambia por otra: misma entrada
    history.replaceState({ pm: 1, i: navIdx }, '');
    return;
  }
  navSnaps.length = navIdx + 1;
  navSnaps.push(now); navIdx++;
  history.pushState({ pm: 1, i: navIdx }, '');
}

function navApply(S) {
  // 1) cierra las ventanas que la foto no tiene abiertas
  navOpenModals().forEach(id => { if (!S.m.includes(id)) NAV_CLOSERS[id](); });
  const sameTab = S.t === currentTab;
  if (!sameTab) resetAllFilters();
  // 2) recoloca país / período / filtros / estado abierto
  if (S.t === 'album') {
    currentCountryId = S.c || null; albumPeriodId = S.p || ''; albumGroup = S.g || ''; movingCoinId = null;
    if (sameTab) {
      const [flags, per] = S.f.split('|');
      albumOnlyMissing = flags[0] === '1'; albumOnlyOwned = flags[1] === '1'; albumOnlySpecial = flags[2] === '1';
      Object.keys(periodOnlyMissing).forEach(k => delete periodOnlyMissing[k]);
      per.split(',').filter(Boolean).forEach(k => { periodOnlyMissing[k] = true; });
      setFilterButtonState('btn-only-missing', albumOnlyMissing);
      setFilterButtonState('btn-only-owned', albumOnlyOwned);
      setFilterButtonState('btn-only-special', albumOnlySpecial);
    }
  } else if (S.t === 'explorar' && sameTab) {
    exploreContinent = S.xc || '';
  } else if (S.t === 'estadisticas' && sameTab) {
    statsGrade = S.sg || ''; statsType = S.st || ''; statsTypeHave = !!S.sh; statsGradePage = 1;
  }
  showTab(S.t);
  render();
  // 3) una entrada que pedía una ventana que ya no está abierta no se puede reconstruir: se sigue hacia atrás
  if (S.m.some(id => !navOpenModals().includes(id))) history.back();
}

window.addEventListener('popstate', e => {
  if (!navReady) return;
  if (navPending > 0) { navPending--; return; }   // retroceso provocado por la propia app: el estado ya está puesto
  const st = e.state;
  if (!st || typeof st.i !== 'number') return;
  let S = navSnaps[st.i];
  if (!S) { S = { t: 'indice', m: [] }; navSnaps[st.i] = S; }   // entrada de una sesión anterior
  navIdx = st.i;
  navApply(S);
});

function navInit() {
  if (navReady) return;
  navReady = true;
  navSnaps = [navSnap()]; navIdx = 0;
  try { history.replaceState({ pm: 1, i: 0 }, ''); } catch (e) {}
  const mo = new MutationObserver(navSync);
  NAV_MODALS.forEach(id => { const el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] }); });
}
