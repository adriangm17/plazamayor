/* ===== TEMAS =====
   Cada tema es una paleta de variables CSS (--xp-*) que se aplica a todo el proyecto.
   Se guarda en localStorage ('plaza-theme') y se aplica al cargar, antes de pintar nada. */
const THEMES = [
  { id: 'classic', name: 'Clásico', desc: 'Berenjena y crema', p: { plum: '#3D1A54', plumD: '#2A0F42', plum2: '#573A70', glow: '#4F2A6E', bg2: '#4B2866', sand: '#E8D5AC', sandL: '#F3E4C4', orange: '#E8702F', muted: '#B98D70', have: '#0d9488', miss: '#ff6f6f', lav: '#E4D4EA' } },
  { id: 'cool', name: 'Frío', desc: 'Azul marino y hielo', p: { plum: '#17324D', plumD: '#0C2036', plum2: '#2F5578', glow: '#1F4468', bg2: '#1D3E5E', sand: '#CFE0EC', sandL: '#E6F0F7', orange: '#2FA3D9', muted: '#6E90AA', have: '#0d9488', miss: '#ff6f6f', lav: '#D8E3F5' } },
  // Grafito: la interfaz en grises neutros con acento naranja eléctrico; el turquesa/rojo de conseguida/falta y las rarezas conservan su color
  { id: 'graphite', name: 'Grafito', desc: 'Grises, con las rarezas a todo color', p: { plum: '#2A2D32', plumD: '#17191C', plum2: '#4B4F57', glow: '#3A3E45', bg2: '#34383E', sand: '#D5D8DD', sandL: '#EEF0F2', orange: '#FF6B00', muted: '#8B9099', have: '#0d9488', miss: '#ff6f6f', lav: '#DCDEE3' } },
  { id: 'olive', name: 'Oliva', desc: 'Verde musgo, pergamino y terracota', p: { plum: '#2F3A22', plumD: '#1B2314', plum2: '#50603C', glow: '#3E4C2D', bg2: '#3A4829', sand: '#E4DFC4', sandL: '#F1EDD8', orange: '#C9692F', muted: '#8F9A6E', have: '#12A594', miss: '#FF6F6F', lav: '#E3E6CF' } },
  { id: 'petrol', name: 'Petróleo', desc: 'Verde azulado y albaricoque', p: { plum: '#0F3D44', plumD: '#08262B', plum2: '#2A6068', glow: '#164E57', bg2: '#14474F', sand: '#D8E6DF', sandL: '#EDF5F0', orange: '#F0A04B', muted: '#6E9A9A', have: '#3DDC97', miss: '#FF7A6B', lav: '#D3E9E5' } },
  { id: 'ink', name: 'Tinta', desc: 'Índigo profundo y ámbar', p: { plum: '#2A2466', plumD: '#181444', plum2: '#4A4390', glow: '#372F7C', bg2: '#332C75', sand: '#E2E0F0', sandL: '#F1F0FA', orange: '#F2A33A', muted: '#8F8CC0', have: '#0d9488', miss: '#ff6f6f', lav: '#DAD8F2' } }
];
const THEME_KEY = 'plaza-theme';

function themeRgb(hex) { const n = parseInt(hex.slice(1), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; }

function applyTheme(id, persist) {
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  const p = t.p, st = document.documentElement.style;
  const set = (k, v) => st.setProperty(k, v);
  set('--xp-plum', p.plum); set('--xp-plum-rgb', themeRgb(p.plum));
  set('--xp-plum-d', p.plumD); set('--xp-plum-d-rgb', themeRgb(p.plumD));
  set('--xp-plum-2', p.plum2); set('--xp-glow', p.glow); set('--xp-bg2', p.bg2);
  set('--xp-sand', p.sand); set('--xp-sand-rgb', themeRgb(p.sand));
  set('--xp-sand-l', p.sandL); set('--xp-sand-l-rgb', themeRgb(p.sandL));
  set('--xp-orange', p.orange); set('--xp-orange-rgb', themeRgb(p.orange));
  set('--xp-muted', p.muted);
  set('--xp-have', p.have); set('--xp-have-rgb', themeRgb(p.have));
  set('--xp-miss', p.miss); set('--xp-lav', p.lav);
  document.documentElement.setAttribute('data-theme', t.id);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', p.plum);
  if (persist) { try { localStorage.setItem(THEME_KEY, t.id); } catch (e) {} }
  return t.id;
}
function currentThemeId() { try { const id = localStorage.getItem(THEME_KEY); return THEMES.some(t => t.id === id) ? id : 'classic'; } catch (e) { return 'classic'; } }   // un tema que ya no existe vuelve al Clásico
applyTheme(currentThemeId(), false);   // se aplica nada más cargar el script (va en <head>)

/* ----- Ventana "Temas" (Ajustes → Temas) ----- */
function openThemeModal() {
  renderThemeModal();
  document.getElementById('theme-modal').classList.remove('hidden');
}
function closeThemeModal() { document.getElementById('theme-modal').classList.add('hidden'); }
function pickTheme(id) { applyTheme(id, true); renderThemeModal(); }
function renderThemeModal() {
  const cur = currentThemeId(), box = document.getElementById('theme-list');
  if (!box) return;
  box.innerHTML = THEMES.map(t => {
    const p = t.p;
    return `<button type="button" class="xt-card ${t.id === cur ? 'xt-on' : ''}" onclick="pickTheme('${t.id}')" aria-pressed="${t.id === cur}">
      <span class="xt-sw">
        <i style="background:${p.plum}"></i><i style="background:${p.plum2}"></i><i style="background:${p.sand}"></i><i style="background:${p.orange}"></i><i style="background:${p.have}"></i><i style="background:${p.miss}"></i>
      </span>
      <span class="xt-txt"><b>${t.name}</b><small>${t.desc}</small></span>
      <span class="xt-check"><i class="fa-solid fa-check"></i></span>
    </button>`;
  }).join('');
}
