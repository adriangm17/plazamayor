/* ===== OPCIONES (Ajustes → Opciones) =====
   Se guardan en localStorage ('plaza-options') y se aplican al cargar como clases de <html>. */
const OPTIONS = [
  { id: 'nofade', cls: 'opt-nofade', name: 'Ver todas las monedas sin difuminar', desc: 'Las monedas que aún no tienes se ven con todo su color y opacidad, igual que las que sí tienes.' },
  { id: 'mark',   cls: 'opt-mark',   name: 'Marca visual', desc: 'Las fichas de las monedas que tienes llevan, además del borde, una franja translúcida de la esquina superior izquierda a la inferior derecha.' }
];
function loadOptions() { try { const o = JSON.parse(localStorage.getItem('plaza-options') || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
function saveOptions(o) { try { localStorage.setItem('plaza-options', JSON.stringify(o)); } catch (e) {} }
function applyOptions() {
  const o = loadOptions();
  OPTIONS.forEach(x => document.documentElement.classList.toggle(x.cls, !!o[x.id]));
}
function toggleOption(id) {
  const o = loadOptions(); o[id] = !o[id]; saveOptions(o); applyOptions(); renderOptionsModal();
}
function renderOptionsModal() {
  const o = loadOptions(), box = document.getElementById('options-list');
  if (!box) return;
  box.innerHTML = OPTIONS.map(x => `
    <button type="button" class="xo-row ${o[x.id] ? 'xo-on' : ''}" onclick="toggleOption('${x.id}')" role="switch" aria-checked="${!!o[x.id]}">
      <span class="xt-txt"><b>${x.name}</b><small>${x.desc}</small></span>
      <span class="xo-sw"><i></i></span>
    </button>`).join('');
}
function openOptionsModal() { renderOptionsModal(); document.getElementById('options-modal').classList.remove('hidden'); }
function closeOptionsModal() { document.getElementById('options-modal').classList.add('hidden'); }
applyOptions();
