/* ===== VENTANAS: país/período, ficha, crear/editar, CSV ===== */

/* ----- Editar país ----- */
function openEditCountryModal() {
  const country = countryById(currentCountryId);
  if (!country) return;
  document.getElementById('input-edit-country-name').value = country.name;
  fillZoneSelect(country.continent || '');
  document.getElementById('input-edit-country-flag').value = country.flag || '';
  pendingFlagImage = undefined;
  updateFlagPreview();
  pendingCardPhoto = undefined;
  loadCardPhotoEditor(country.photo || '');
  cardCoinDraft = { coinId: country.coinId || '', image: country.coinImage || '' };
  updateCardPhotoPreview();
  renderCardCoinPicker();
  document.getElementById('edit-country-modal').classList.remove('hidden');
}

/* ----- Tarjeta del país en Explorar: foto y moneda ----- */
let pendingCardPhoto;                       // undefined = sin cambios, '' = quitar, 'data:…' = nueva
let cardCoinDraft = { coinId: '', image: '' };

// Lee una imagen, la reduce y la devuelve como data URL (WebP conserva la transparencia de las monedas recortadas)
function readImageAsDataURL(file, maxDim, quality, cb) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('Elige un archivo de imagen.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      const k = Math.min(1, maxDim / Math.max(w0, h0));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w0 * k));
      canvas.height = Math.max(1, Math.round(h0 * k));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      let url = canvas.toDataURL('image/webp', quality);
      if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/png');   // navegadores sin WebP
      cb(url);
    };
    img.onerror = () => alert('No se pudo leer la imagen.');
    img.src = e.target.result;
  };
  reader.onerror = () => alert('No se pudo leer el archivo.');
  reader.readAsDataURL(file);
}

/* Encuadre de la foto: se arrastra y se hace zoom sobre un recuadro con las mismas proporciones que la foto de la tarjeta (212×164);
   al guardar se recorta exactamente lo que se ve, así no depende de cómo se ajuste la imagen en la tarjeta. */
const CARD_PHOTO_W = 636, CARD_PHOTO_H = 492;
let cardPhotoEdit = { img: null, zoom: 1, ox: 0.5, oy: 0.5, dirty: false };
let cardPhotoDragBound = false;

function cardPhotoDraw(ctx, W, H) {
  const e = cardPhotoEdit, img = e.img;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const sc = Math.max(W / iw, H / ih) * e.zoom;
  const dw = iw * sc, dh = ih * sc;
  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, (W - dw) * e.ox, (H - dh) * e.oy, dw, dh);
  return { dw, dh };
}

function updateCardPhotoPreview() {
  const box = document.getElementById('card-photo-preview');
  const cv = document.getElementById('card-photo-canvas');
  if (!box || !cv) return;
  const has = !!cardPhotoEdit.img;
  box.classList.toggle('xp-nophoto', !has);
  const empty = document.getElementById('card-photo-empty');
  if (empty) empty.style.display = has ? 'none' : '';
  const zr = document.getElementById('card-photo-zoomrow');
  if (zr) zr.style.display = has ? '' : 'none';
  if (has) cardPhotoDraw(cv.getContext('2d'), cv.width, cv.height);
  bindCardPhotoDrag();
}

function loadCardPhotoEditor(src) {
  cardPhotoEdit = { img: null, zoom: 1, ox: 0.5, oy: 0.5, dirty: false };
  const z = document.getElementById('card-photo-zoom'); if (z) z.value = 1;
  updateCardPhotoPreview();
  if (!src) return;
  const img = new Image();
  img.onload = () => { if (cardPhotoEdit.dirty || cardPhotoEdit.img) return; cardPhotoEdit.img = img; updateCardPhotoPreview(); };
  img.src = src;
}

function onCardPhotoSelected(input) {
  const file = input.files[0];
  input.value = '';
  readImageAsDataURL(file, 1600, 0.85, url => {
    const img = new Image();
    img.onload = () => {
      cardPhotoEdit = { img, zoom: 1, ox: 0.5, oy: 0.5, dirty: true };
      const z = document.getElementById('card-photo-zoom'); if (z) z.value = 1;
      updateCardPhotoPreview();
    };
    img.src = url;
  });
}

function onCardPhotoZoom(v) {
  if (!cardPhotoEdit.img) return;
  cardPhotoEdit.zoom = Math.max(1, parseFloat(v) || 1);
  cardPhotoEdit.dirty = true;
  updateCardPhotoPreview();
}

function clearCardPhoto() {
  cardPhotoEdit = { img: null, zoom: 1, ox: 0.5, oy: 0.5, dirty: false };
  pendingCardPhoto = '';
  const z = document.getElementById('card-photo-zoom'); if (z) z.value = 1;
  updateCardPhotoPreview();
}

// Al guardar: si se ha tocado el encuadre, se genera la imagen recortada
function finalizeCardPhoto() {
  const e = cardPhotoEdit;
  if (!e.img || !e.dirty) return;
  const cv = document.createElement('canvas'); cv.width = CARD_PHOTO_W; cv.height = CARD_PHOTO_H;
  cardPhotoDraw(cv.getContext('2d'), CARD_PHOTO_W, CARD_PHOTO_H);
  let url = cv.toDataURL('image/webp', 0.85);
  if (!url.startsWith('data:image/webp')) url = cv.toDataURL('image/jpeg', 0.85);
  pendingCardPhoto = url;
  e.dirty = false;
}

function bindCardPhotoDrag() {
  const box = document.getElementById('card-photo-preview');
  if (!box || cardPhotoDragBound) return;
  cardPhotoDragBound = true;
  let last = null;
  box.addEventListener('pointerdown', ev => { if (!cardPhotoEdit.img) return; last = { x: ev.clientX, y: ev.clientY }; box.setPointerCapture(ev.pointerId); box.style.cursor = 'grabbing'; });
  box.addEventListener('pointermove', ev => {
    if (!last || !cardPhotoEdit.img) return;
    const r = box.getBoundingClientRect(), e = cardPhotoEdit, img = e.img;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const sc = Math.max(r.width / iw, r.height / ih) * e.zoom;
    const ovx = iw * sc - r.width, ovy = ih * sc - r.height;   // sobrante en píxeles de pantalla
    if (ovx > 0.5) e.ox = Math.min(1, Math.max(0, e.ox - (ev.clientX - last.x) / ovx));
    if (ovy > 0.5) e.oy = Math.min(1, Math.max(0, e.oy - (ev.clientY - last.y) / ovy));
    last = { x: ev.clientX, y: ev.clientY };
    e.dirty = true;
    updateCardPhotoPreview();
  });
  const end = () => { last = null; box.style.cursor = ''; };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
}

function renderCardCoinPicker() {
  const box = document.getElementById('card-coin-picker');
  const country = countryById(currentCountryId);
  if (!box || !country) return;
  const list = coinsOfCountry(country.id).filter(c => c.hasFront).slice(0, 60);
  const custom = cardCoinDraft.image;
  const chosen = !custom && cardCoinDraft.coinId && list.some(c => c.id === cardCoinDraft.coinId) ? cardCoinDraft.coinId : '';
  const tile = (sel, onclick, inner, title) => `<button type="button" class="xp-coin-tile ${sel ? 'xp-sel' : ''}" onclick="${onclick}" title="${esc(title)}" aria-label="${esc(title)}" aria-pressed="${sel}">${inner}</button>`;
  box.innerHTML =
    tile(!custom && !chosen, "pickCardCoin('')", 'Auto', 'Automática') +
    (custom ? tile(true, "pickCardCoin('')", `<img src="${esc(custom)}" alt="">`, 'Tu imagen (pulsa para quitarla)') : '') +
    list.map(c => tile(chosen === c.id, `pickCardCoin('${jsArg(c.id)}')`, imgTag(c.id, 'front'), c.denom)).join('');
  hydrateImages(box);
}
function pickCardCoin(coinId) { cardCoinDraft = { coinId, image: '' }; renderCardCoinPicker(); }
function onCardCoinSelected(input) {
  const file = input.files[0];
  input.value = '';
  readImageAsDataURL(file, 420, 0.85, url => { cardCoinDraft = { coinId: '', image: url }; renderCardCoinPicker(); });
}

function closeEditCountryModal() {
  document.getElementById('edit-country-modal').classList.add('hidden');
}

function saveEditedCountryName() {
  const country = countryById(currentCountryId);
  const newName = document.getElementById('input-edit-country-name').value.trim();
  if (!country || !newName) { closeEditCountryModal(); return; }

  const clash = countries.find(c => c.id !== country.id && normName(c.name) === normName(newName));
  if (clash) { alert('Ya existe un país con este nombre.'); return; }

  const flagVal = document.getElementById('input-edit-country-flag').value.trim().toLowerCase();
  if (flagVal && !FLAG_CODE_RE.test(flagVal)) { alert('Código de bandera no válido. Usa el código ISO de 2 letras (es, fr, de…) o déjalo vacío para que sea automática.'); return; }
  if (flagVal) country.flag = flagVal; else delete country.flag;
  if (pendingFlagImage !== undefined) {
    if (pendingFlagImage) country.flagImage = pendingFlagImage; else delete country.flagImage;
    pendingFlagImage = undefined;
  }

  finalizeCardPhoto();
  if (pendingCardPhoto !== undefined) {
    if (pendingCardPhoto) country.photo = pendingCardPhoto; else delete country.photo;
    pendingCardPhoto = undefined;
  }
  if (cardCoinDraft.image) country.coinImage = cardCoinDraft.image; else delete country.coinImage;
  if (cardCoinDraft.coinId && !cardCoinDraft.image) country.coinId = cardCoinDraft.coinId; else delete country.coinId;

  country.name = newName;
  const cont = document.getElementById('input-edit-country-continent').value;
  if (cont) country.continent = cont; else delete country.continent;
  persistMeta();
  closeEditCountryModal();
  render();
}

/* ----- Eliminar un país por completo (con doble confirmación) ----- */
async function deleteCurrentCountry() {
  const country = countryById(currentCountryId);
  if (!country) return;
  const ps = periodsOfCountry(country.id), cs = coinsOfCountry(country.id);
  const nombre = prettyName(country.name);
  const resumen = `${ps.length} ${ps.length === 1 ? 'período' : 'períodos'} y ${cs.length} ${cs.length === 1 ? 'moneda' : 'monedas'}`;
  if (!confirm(`¿Eliminar por completo "${nombre}"?\n\nSe borrarán ${resumen} (con sus imágenes). Esta acción no se puede deshacer.\n\nSi lo necesitas, exporta antes una copia de seguridad.`)) return;
  if (!confirm(`Segunda confirmación: "${nombre}" y todo su contenido se eliminarán definitivamente.\n\n¿Seguro que quieres continuar?`)) return;

  const id = country.id;
  const coinIds = cs.map(c => c.id);
  coins = coins.filter(c => c.countryId !== id);
  coinIds.forEach(cid => { forgetImageUrl(imgKey(cid, 'front')); forgetImageUrl(imgKey(cid, 'back')); });
  await Promise.all(coinIds.map(cid => deleteCoinFromDB(cid)));
  periods = periods.filter(p => p.countryId !== id);
  countries = countries.filter(c => c.id !== id);
  await persistMeta();
  delete indiceCollapsedCountries[id];
  currentCountryId = null;
  albumPeriodId = ''; albumGroup = '';
  activeCoinId = null;
  movingCoinId = null;
  closeEditCountryModal();
  render();
}

/* ----- Editar período ----- */
function openEditPeriodModal(periodId) {
  const p = periodById(periodId);
  if (!p) return;
  pendingNewPeriodCountry = '';
  document.getElementById('edit-period-title').innerText = 'Editar Período';
  document.getElementById('edit-period-move-box').classList.remove('hidden');
  // Solo se puede eliminar un período que no tenga monedas
  const del = document.getElementById('btn-period-delete');
  del.classList.toggle('hidden', coinsOfPeriod(p.id).length > 0);
  del.classList.toggle('flex', coinsOfPeriod(p.id).length === 0);
  document.getElementById('input-edit-period-old').value = p.id;
  document.getElementById('input-edit-period-name').value = p.name;
  updatePeriodMoveUI(p.id);
  document.getElementById('edit-period-modal').classList.remove('hidden');
}

/* ----- Añadir período a un país (puede quedarse vacío, como marcador de posición) ----- */
let pendingNewPeriodCountry = '';
function openAddPeriodModal(countryId) {
  if (!countryById(countryId)) return;
  pendingNewPeriodCountry = countryId;
  document.getElementById('input-edit-period-old').value = '';
  document.getElementById('input-edit-period-name').value = '';
  document.getElementById('edit-period-title').innerText = 'Nuevo Período';
  document.getElementById('edit-period-move-box').classList.add('hidden');
  const del = document.getElementById('btn-period-delete');
  del.classList.add('hidden'); del.classList.remove('flex');
  document.getElementById('edit-period-modal').classList.remove('hidden');
  setTimeout(() => { const i = document.getElementById('input-edit-period-name'); if (i) i.focus(); }, 50);
}

// Elimina el período abierto en la ventana, solo si no tiene monedas
function deleteEmptyPeriodFromModal() {
  const id = document.getElementById('input-edit-period-old').value;
  const p = periodById(id);
  if (!p) return;
  if (coinsOfPeriod(id).length > 0) { alert('Este período tiene monedas: solo se pueden eliminar períodos vacíos.'); return; }
  if (!confirm(`¿Eliminar el período "${p.name}"? Está vacío.`)) return;
  const owner = countryById(p.countryId);
  periods = periods.filter(x => x.id !== id);
  // Si era el último período del país, el país se conserva (se elimina desde su ventana de edición)
  if (owner && periodsOfCountry(owner.id).length === 0) owner.keep = true;
  if (albumPeriodId === id) albumPeriodId = '';
  persistMeta();
  closeEditPeriodModal();
  render();
}

// Subir / bajar el período dentro de su país (desde la ventana de edición)
function updatePeriodMoveUI(periodId) {
  const p = periodById(periodId);
  const list = p ? periodsOfCountry(p.countryId) : [];
  const idx = list.findIndex(x => x.id === periodId);
  document.getElementById('btn-period-up').disabled = idx <= 0;
  document.getElementById('btn-period-down').disabled = idx < 0 || idx >= list.length - 1;
  document.getElementById('edit-period-pos').innerText = idx >= 0 ? `Posición ${idx + 1} de ${list.length}` : '';
}

function movePeriodFromModal(direction) {
  const id = document.getElementById('input-edit-period-old').value;
  const p = periodById(id);
  if (!p) return;
  currentCountryId = p.countryId;
  movePeriod(id, direction);
  updatePeriodMoveUI(id);
}

function closeEditPeriodModal() {
  pendingNewPeriodCountry = '';
  document.getElementById('edit-period-modal').classList.add('hidden');
}

function saveEditedPeriodName() {
  const oldId = document.getElementById('input-edit-period-old').value;
  const newName = document.getElementById('input-edit-period-name').value.trim();

  // Modo "nuevo período"
  if (!oldId && pendingNewPeriodCountry) {
    const countryId = pendingNewPeriodCountry;
    if (!countryById(countryId) || !newName) { closeEditPeriodModal(); return; }
    if (findPeriodByName(countryId, newName)) { alert('Ya existe un período con este nombre en este país.'); return; }
    const np = getOrCreatePeriod(countryId, newName);
    np.keep = true;   // creado a mano: se conserva aunque no tenga monedas
    indiceCollapsedCountries[countryId] = false;   // en el Índice, el país se abre para que se vea el nuevo período
    persistMeta();
    closeEditPeriodModal();
    render();
    return;
  }

  const p = periodById(oldId);
  if (!p || !newName) { closeEditPeriodModal(); return; }

  const clash = periods.find(x => x.id !== p.id && x.countryId === p.countryId && normName(x.name) === normName(newName));
  if (clash) { alert('Ya existe un período con este nombre en este país.'); return; }

  p.name = newName;
  persistMeta();
  closeEditPeriodModal();
  render();
}

/* ----- Ficha de la moneda ----- */
function coinCountryName(coin) { const c = countryById(coin.countryId); return c ? c.name : ''; }
function coinPeriodName(coin) { const p = periodById(coin.periodId); return p ? p.name.trim() : 'General'; }

function setMaterialBox(coin) {
  const matLabel = document.getElementById('modal-grid-material-label');
  const matValue = document.getElementById('modal-grid-material');
  if (isSilverCoin(coin)) {
    matLabel.innerText = 'VALOR ESTIMADO';
    matValue.className = 'xm-val xm-silverv';
    matValue.innerText = computeCoinSilverValue(coin) || '0,00 €';
  } else {
    matLabel.innerText = 'CECA/VARIANTE';
    matValue.className = 'xm-val';
    matValue.innerText = (coin.cecaMaterial && coin.cecaMaterial.trim() !== '') ? coin.cecaMaterial : '—';
  }
}

function openCoinModal(id) {
  formatMenuIdx = -1;
  activeCoinId = id;
  const coin = coins.find(c => c.id === id);
  if (!coin) return;

  const periodName = coinPeriodName(coin);
  const displayRange = formatYearRange(coin.range);

  document.getElementById('modal-title').innerText = coin.denom;
  document.getElementById('modal-subtitle').innerText = `${coinCountryName(coin)} · ${periodName} · ${displayRange}`;
  document.getElementById('modal-grid-period').innerText = periodName;
  document.getElementById('modal-grid-range').innerText = displayRange;
  document.getElementById('modal-grid-km').innerText = coin.km || 'KM# -';
  setMaterialBox(coin);

  // La rareza solo se muestra aquí; se cambia desde "Editar ficha"
  const chip = document.getElementById('modal-rarity-chip');
  if (coin.rarity) {
    chip.innerText = String(coin.rarity).toUpperCase();
    chip.style.cssText = getRarityStyle(coin.rarity);
    chip.classList.remove('hidden');
  } else {
    chip.classList.add('hidden');
  }

  const typeChip = document.getElementById('modal-type-chip');
  const type = coinType(coin);
  typeChip.innerText = type.toUpperCase();
  typeChip.style.cssText = coinTypeChipStyle(type);
  typeChip.classList.remove('hidden');

  setLinkBox('modal-grid-numista', coin.numistaUrl, 'xm-lk-numista');
  setLinkBox('modal-grid-ucoin', coin.ucoinUrl, 'xm-lk-ucoin');

  document.getElementById('silver-weight-input').value = coin.silverWeight || '';
  document.getElementById('silver-purity-input').value = coin.silverPurity || '900';

  renderCoinItems();
  toggleSilverValuation(coin.rarity);

  const front = document.getElementById('modal-coin-front');
  const back = document.getElementById('modal-coin-back');
  let baseStyleClass = 'coin-base-style';
  const mat = (coin.cecaMaterial || '').toLowerCase();
  if (mat.includes('oro')) baseStyleClass = 'coin-oro-style';
  if (mat.includes('cobre') || mat.includes('bronce')) baseStyleClass = 'coin-cobre-style';

  front.className = `coin-front ${!coin.hasFront ? baseStyleClass : 'has-img'}`;
  back.className = `coin-back ${!coin.hasBack ? baseStyleClass : 'has-img'}`;
  const fallback = `<span class="xm-fallback">${esc(coin.denom)}</span>`;
  front.innerHTML = coin.hasFront ? imgTag(coin.id, 'front') : fallback;
  back.innerHTML = coin.hasBack ? imgTag(coin.id, 'back') : fallback;
  hydrateImages(front); hydrateImages(back);

  document.getElementById('modal-coin-inner').classList.remove('flipped');
  document.getElementById('modal-side-label').innerText = 'Anverso · toca para girar';
  document.getElementById('coin-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('coin-modal').classList.add('hidden');
}

function flipCoinModal() {
  const inner = document.getElementById('modal-coin-inner');
  inner.classList.toggle('flipped');
  document.getElementById('modal-side-label').innerText = inner.classList.contains('flipped')
    ? 'Reverso · toca para girar'
    : 'Anverso · toca para girar';
}

function toggleSilverValuation(rarity) {
  const container = document.getElementById('silver-valuation-container');
  if (rarity && rarity.toUpperCase() === 'PLATA') {
    container.classList.remove('hidden');
    calculateSilverValue(false);
  } else {
    container.classList.add('hidden');
  }
}

let silverSaveTimer = null;
function calculateSilverValue(persist = true) {
  if (!activeCoinId) return;
  const weightInput = document.getElementById('silver-weight-input').value;
  const purityInput = document.getElementById('silver-purity-input').value;
  const weight = parseFloat(weightInput) || 0;
  let purity = parseFloat(purityInput) || 0;
  if (purity > 0 && purity <= 1) purity *= 1000;

  let formatted = '0,00 €';
  if (weight > 0 && purity > 0) {
    formatted = `${(weight * (purity / 1000) * currentSilverPricePerGram).toFixed(2).replace('.', ',')} €`;
  }
  document.getElementById('silver-calculated-value').innerText = formatted;

  const coin = coins.find(c => c.id === activeCoinId);
  if (coin && persist === true) {
    coin.silverWeight = weightInput;
    coin.silverPurity = purityInput;
    clearTimeout(silverSaveTimer);
    silverSaveTimer = setTimeout(() => { if (coins.includes(coin)) saveCoins(coin); }, 400);
    const matValue = document.getElementById('modal-grid-material');
    if (matValue && isSilverCoin(coin)) matValue.innerText = formatted;
  }
}

// Solo se abren enlaces http(s) (una copia de seguridad ajena podría traer "javascript:…")
function openCoinLink(raw, site) {
  const u = String(raw || '').trim();
  if (!u) { alert(`Sin enlace de ${site} registrado para esta moneda.`); return; }
  let parsed = null;
  try { parsed = new URL(u); } catch (e) {}
  if (!parsed || !/^https?:$/.test(parsed.protocol)) { alert(`El enlace de ${site} no es válido (debe empezar por https://).`); return; }
  window.open(parsed.href, '_blank', 'noopener');
}
function openNumistaLink() { const c = coins.find(x => x.id === activeCoinId); openCoinLink(c && c.numistaUrl, 'Numista'); }
function openUcoinLink() { const c = coins.find(x => x.id === activeCoinId); openCoinLink(c && c.ucoinUrl, 'Ucoin'); }

/* ----- Ejemplares (año · conservación · notas) ----- */
function newCoinItem() { return { year: '', grade: '', format: DEFAULT_ITEM_FORMAT, notes: '' }; }

function coinItems(coin) {
  if (!Array.isArray(coin.items) || coin.items.length === 0) coin.items = [newCoinItem()];
  return coin.items;
}

function setLinkBox(id, url, colorClass) {
  const el = document.getElementById(id);
  if (!el) return;
  const has = Boolean(url && url.trim() !== '');
  el.innerHTML = has ? 'Abrir <i class="fa-solid fa-arrow-up-right-from-square text-[8px]"></i>' : 'Sin enlace';
  el.className = `xm-val ${has ? colorClass : 'xm-nolink'}`;
}

/* Selector de formato: muestra solo el icono actual; al pulsar se despliegan todos en vertical */
let formatMenuIdx = -1;
function formatPickerHtml(i, it) {
  const cur = ITEM_FORMATS.some(f => f.id === it.format) ? it.format : DEFAULT_ITEM_FORMAT;
  const isDefault = cur === DEFAULT_ITEM_FORMAT;
  const btn = `<button type="button" onclick="event.stopPropagation(); toggleFormatMenu(${i})" aria-haspopup="true" aria-label="Formato" title="Formato" class="xm-fbtn ${isDefault ? '' : 'xm-on'}">${itemFormatIcon(cur, 18)}</button>`;
  if (formatMenuIdx !== i) return `<div class="xm-fwrap">${btn}</div>`;
  const opts = ITEM_FORMATS.map(f => { const on = f.id === cur; return `<button type="button" role="menuitemradio" aria-checked="${on}" aria-label="${f.label}" title="${f.label}" onclick="event.stopPropagation(); onItemFormat(${i}, '${f.id}')" class="xm-fopt ${on ? 'xm-on' : ''}">${itemFormatIcon(f.id, 18)}</button>`; }).join('');
  return `<div class="xm-fwrap"><div class="xm-fmenu" role="menu">${opts}</div></div>`;
}
function toggleFormatMenu(i) {
  formatMenuIdx = (formatMenuIdx === i) ? -1 : i;
  renderCoinItems();
}
window.addEventListener('click', () => { if (formatMenuIdx !== -1) { formatMenuIdx = -1; renderCoinItems(); } });

function renderCoinItems() {
  const coin = coins.find(c => c.id === activeCoinId);
  const box = document.getElementById('coin-items-container');
  if (!coin || !box) return;
  const items = coinItems(coin);
  const range = parseYearRange(coin.range);
  const ph = range ? String(range.min) : 'Año';
  box.innerHTML = items.map((it, i) => `
    <div class="xm-row">
      <input type="number" inputmode="numeric" value="${esc(it.year)}" placeholder="${esc(ph)}" oninput="onItemField(${i}, 'year', this.value)" class="xm-field xm-year">
      <select onchange="onItemGrade(${i}, this.value)" class="xm-field xm-grade ${it.grade ? 'xm-on' : ''}">
        <option value="">—</option>
        ${GRADES.map(g => `<option value="${g}" ${g === it.grade ? 'selected' : ''}>${g}</option>`).join('')}
      </select>
      ${formatPickerHtml(i, it)}
      <input type="text" value="${esc(it.notes)}" placeholder="Notas" oninput="onItemField(${i}, 'notes', this.value)" class="xm-field xm-notes">
      ${items.length > 1 ? `<button onclick="removeCoinItem(${i})" class="xm-trash" title="Quitar esta moneda"><i class="fa-solid fa-trash-can"></i></button>` : ''}
    </div>
  `).join('');
}

let itemSaveTimer = null;
function onItemField(i, field, value) {
  const coin = coins.find(c => c.id === activeCoinId);
  if (!coin) return;
  coinItems(coin)[i][field] = value;
  clearTimeout(itemSaveTimer);
  itemSaveTimer = setTimeout(() => { if (coins.includes(coin)) saveCoins(coin); }, 400);
}

function onItemGrade(i, grade) {
  const coin = coins.find(c => c.id === activeCoinId);
  if (!coin) return;
  const it = coinItems(coin)[i];
  it.grade = grade;
  if (grade && !it.year) {
    const r = parseYearRange(coin.range);
    if (r) it.year = String(r.min);
  }
  clearTimeout(itemSaveTimer);
  renderCoinItems();
  saveCoins(coin);
}

function onItemFormat(i, format) {
  const coin = coins.find(c => c.id === activeCoinId);
  if (!coin) return;
  coinItems(coin)[i].format = format;
  formatMenuIdx = -1;
  clearTimeout(itemSaveTimer);
  renderCoinItems();
  saveCoins(coin);
}

function addCoinItem() {
  const coin = coins.find(c => c.id === activeCoinId);
  if (!coin) return;
  coinItems(coin).push(newCoinItem());
  renderCoinItems();
  const last = document.getElementById('coin-items-container').lastElementChild;
  if (last) last.querySelector('input').focus();
}

function removeCoinItem(i) {
  const coin = coins.find(c => c.id === activeCoinId);
  if (!coin) return;
  const items = coinItems(coin);
  const it = items[i];
  if ((it.year || it.grade || it.notes) && !confirm('¿Quitar esta moneda?')) return;
  items.splice(i, 1);
  clearTimeout(itemSaveTimer);
  renderCoinItems();
  saveCoins(coin);
}

async function deleteCurrentCoin() {
  if (!activeCoinId) return;
  if (!confirm('¿Eliminar de la colección?')) return;
  const id = activeCoinId;
  clearTimeout(silverSaveTimer);
  clearTimeout(itemSaveTimer);
  coins = coins.filter(c => c.id !== id);
  forgetImageUrl(imgKey(id, 'front')); forgetImageUrl(imgKey(id, 'back'));
  await deleteCoinFromDB(id);
  if (pruneEmpty()) await persistMeta();
  activeCoinId = null;
  closeModal();
  render();
}

/* ----- Crear / editar ficha ----- */
function openCreateModal(periodId) {
  document.getElementById('edit-coin-id').value = '';
  document.getElementById('create-modal-title').innerText = 'Añadir Hueco al Álbum';
  document.getElementById('create-form').reset();
  document.getElementById('new-img-front').value = '';
  document.getElementById('new-img-back').value = '';
  document.getElementById('label-file-front').innerText = 'JPG, PNG, WEBP';
  document.getElementById('label-file-back').innerText = 'JPG, PNG, WEBP';
  const country = countryById(currentCountryId);
  document.getElementById('new-country').value = country ? country.name : '';
  const preset = (typeof periodId === 'string') ? periodById(periodId) : null;   // desde el + de un período
  if (preset) {
    const owner = countryById(preset.countryId);
    if (owner) document.getElementById('new-country').value = owner.name;
    document.getElementById('new-period').value = preset.name;
  }
  document.getElementById('create-modal').classList.remove('hidden');
}

async function openAdvancedEditFromModal() {
  closeModal();
  const coin = coins.find(c => c.id === activeCoinId);
  if (!coin) return;

  document.getElementById('edit-coin-id').value = coin.id;
  document.getElementById('create-modal-title').innerText = 'Editar Hueco';
  document.getElementById('new-country').value = coinCountryName(coin);
  document.getElementById('new-period').value = coinPeriodName(coin);
  document.getElementById('new-denom').value = coin.denom;
  document.getElementById('new-ceca-material').value = coin.cecaMaterial || '';
  document.getElementById('new-km').value = coin.km || '';
  document.getElementById('new-rarity').value = coin.rarity || 'C';
  document.getElementById('new-range').value = coin.range || '';
  document.getElementById('new-type').value = coinType(coin);
  document.getElementById('new-numista-url').value = coin.numistaUrl || '';
  document.getElementById('new-ucoin-url').value = coin.ucoinUrl || '';

  for (const [side, hid, lab] of [['front', 'new-img-front', 'label-file-front'], ['back', 'new-img-back', 'label-file-back']]) {
    document.getElementById(hid).value = '';
    document.getElementById(lab).innerText = 'JPG, PNG, WEBP';
    const blob = coin[side === 'front' ? 'hasFront' : 'hasBack'] ? await dbGetImage(imgKey(coin.id, side)) : null;
    if (blob) {
      document.getElementById(hid).value = await blobToDataURL(blob);
      document.getElementById(lab).innerText = 'Imagen actual (toca para cambiarla)';
    }
  }
  document.getElementById('create-modal').classList.remove('hidden');
}

function closeCreateModal() {
  document.getElementById('create-modal').classList.add('hidden');
}

/* ----- Procesado de imágenes subidas ----- */
let pendingImageJobs = 0;

function removeWhiteBackground(ctx, w, h, tol) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const lim = 255 - tol;
  const isWhite = (i) => d[i + 3] > 250 && d[i] >= lim && d[i + 1] >= lim && d[i + 2] >= lim;

  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  if (!corners.every(isWhite)) return false;

  const visited = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (visited[p] || !isWhite(p * 4)) return;
    visited[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p - x) / w;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  for (let p = 0; p < visited.length; p++) if (visited[p]) d[p * 4 + 3] = 0;
  ctx.putImageData(imgData, 0, 0);
  return true;
}

function trimTransparent(canvas) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas;
  const pad = 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  if (cw === w && ch === h) return canvas;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

function clearCoinImage(targetInputId, labelId, fileInputId) {
  document.getElementById(targetInputId).value = '';
  document.getElementById(fileInputId).value = '';
  const label = document.getElementById(labelId);
  if (label) label.innerText = 'JPG, PNG, WEBP';
}

function handleFileSelect(event, targetInputId, labelId) {
  const file = event.target.files[0];
  if (!file) return;
  processImageSource(file, file.name, targetInputId, labelId);
}

// Convierte un File/Blob en la imagen procesada (redimensionada, sin fondo blanco, recortada)
function processImageSource(blob, displayName, targetInputId, labelId) {
  const label = labelId ? document.getElementById(labelId) : null;
  if (label) label.innerText = 'Procesando...';
  pendingImageJobs++;
  let finished = false;
  const done = () => { if (!finished) { finished = true; pendingImageJobs = Math.max(0, pendingImageJobs - 1); } };

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      let canvas = document.createElement('canvas');
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > h) { if (w > IMG_MAX_DIM) { h *= IMG_MAX_DIM / w; w = IMG_MAX_DIM; } }
      else { if (h > IMG_MAX_DIM) { w *= IMG_MAX_DIM / h; h = IMG_MAX_DIM; } }
      w = Math.max(1, Math.round(w));
      h = Math.max(1, Math.round(h));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        if (WHITE_BG_TOLERANCE > 0) removeWhiteBackground(ctx, w, h, WHITE_BG_TOLERANCE);
        canvas = trimTransparent(canvas);
      } catch (err) {}
      document.getElementById(targetInputId).value = canvas.toDataURL('image/webp', IMG_QUALITY);
      if (label) label.innerText = `Cargado: ${displayName || 'imagen'}`;
      done();
    };
    img.onerror = function() {
      if (label) label.innerText = 'No se pudo leer la imagen';
      done();
    };
    img.src = e.target.result;
  };
  reader.onerror = function() {
    if (label) label.innerText = 'Error al leer el archivo';
    done();
  };
  reader.readAsDataURL(blob);
}

// Descarga una imagen desde una URL (arrastrada desde una web) y la procesa
async function loadImageFromUrl(url, targetInputId, labelId) {
  const label = labelId ? document.getElementById(labelId) : null;
  if (label) label.innerText = 'Descargando imagen...';
  try {
    let blob;
    if (/^data:/i.test(url)) {
      blob = dataURLToBlob(url);
    } else {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      blob = await res.blob();
    }
    if (!blob.type.startsWith('image/')) throw new Error('No es una imagen');
    let name = 'imagen web';
    try { name = decodeURIComponent(new URL(url).pathname.split('/').pop()) || name; } catch (e) {}
    processImageSource(blob, name, targetInputId, labelId);
  } catch (err) {
    if (label) label.innerText = 'Esa web no permite copiar la imagen';
    alert('No se pudo descargar la imagen desde esa web (la página bloquea el acceso).\n\nAlternativa: clic derecho sobre la imagen → "Copiar imagen", haz clic en este recuadro y pulsa Ctrl+V (o Cmd+V).');
  }
}

// Saca la imagen de un evento de arrastrar o pegar: archivo, URL o <img> incrustado
function extractImageFromTransfer(dt) {
  if (!dt) return null;
  for (const f of (dt.files || [])) if (f.type.startsWith('image/')) return { file: f };
  for (const it of (dt.items || [])) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) return { file: f };
    }
  }
  const html = dt.getData('text/html');
  if (html) {
    const m = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(html);
    if (m) {
      const tmp = document.createElement('textarea');
      tmp.innerHTML = m[1];
      return { url: tmp.value };
    }
  }
  const uri = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split('\n').map(x => x.trim()).find(x => /^(https?:|data:image)/i.test(x));
  if (uri) return { url: uri };
  return null;
}

let lastImageZone = 'front';

function setupImageDropzones() {
  const zones = [
    { side: 'front', input: 'file-front', hidden: 'new-img-front', label: 'label-file-front' },
    { side: 'back', input: 'file-back', hidden: 'new-img-back', label: 'label-file-back' }
  ];
  const load = (z, found) => {
    if (found.file) processImageSource(found.file, found.file.name || 'imagen pegada', z.hidden, z.label);
    else loadImageFromUrl(found.url, z.hidden, z.label);
  };
  zones.forEach(z => {
    const box = document.getElementById(z.input).parentElement;
    box.tabIndex = 0;
    const mark = () => { lastImageZone = z.side; };
    box.addEventListener('mouseenter', mark);
    box.addEventListener('focus', mark);
    box.addEventListener('click', mark);
    // Fase de captura: se atiende antes que el input de archivo, que solo acepta archivos locales
    box.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); box.classList.add('border-amber-500'); }, true);
    box.addEventListener('dragleave', () => box.classList.remove('border-amber-500'), true);
    box.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      box.classList.remove('border-amber-500');
      lastImageZone = z.side;
      const found = extractImageFromTransfer(e.dataTransfer);
      if (found) load(z, found);
      else document.getElementById(z.label).innerText = 'No se detectó ninguna imagen';
    }, true);
  });
  // Pegar (Ctrl+V) con la ficha abierta
  document.addEventListener('paste', e => {
    const modal = document.getElementById('create-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.type !== 'file') return;
    const found = extractImageFromTransfer(e.clipboardData);
    if (!found) return;
    e.preventDefault();
    load(zones.find(z => z.side === lastImageZone) || zones[0], found);
  });
}

async function handleSaveCoin(e) {
  e.preventDefault();
  if (pendingImageJobs > 0) { alert('Procesando imagen, espera un instante.'); return; }

  const editId = document.getElementById('edit-coin-id').value;
  const countryName = document.getElementById('new-country').value.trim();
  const periodName = document.getElementById('new-period').value.trim() || 'General';
  if (!countryName) return;
  const fields = {
    denom: document.getElementById('new-denom').value,
    cecaMaterial: document.getElementById('new-ceca-material').value,
    km: document.getElementById('new-km').value,
    rarity: document.getElementById('new-rarity').value,
    type: coinType({ type: document.getElementById('new-type').value }),
    range: document.getElementById('new-range').value || 'S/F',
    numistaUrl: document.getElementById('new-numista-url').value,
    ucoinUrl: document.getElementById('new-ucoin-url').value
  };
  const imgFront = document.getElementById('new-img-front').value;
  const imgBack = document.getElementById('new-img-back').value;

  const country = getOrCreateCountry(countryName);
  const period = getOrCreatePeriod(country.id, periodName);

  let savedCoin = null;
  if (editId) {
    const coin = coins.find(c => c.id === editId);
    if (coin) {
      savedCoin = coin;
      if (coin.periodId !== period.id) coin.order = nextCoinOrder(period.id);
      coin.countryId = country.id;
      coin.periodId = period.id;
      Object.assign(coin, fields);
    }
  } else {
    savedCoin = {
      id: newId(), countryId: country.id, periodId: period.id, ...fields,
      acquired: false, year: '', grade: '', hasFront: false, hasBack: false,
      order: nextCoinOrder(period.id), silverWeight: '', silverPurity: '900'
    };
    coins.push(savedCoin);
  }

  if (savedCoin) {
    for (const [side, flag, val] of [['front', 'hasFront', imgFront], ['back', 'hasBack', imgBack]]) {
      const key = imgKey(savedCoin.id, side);
      try {
        if (val && val.startsWith('data:')) {
          await dbPutImage(key, dataURLToBlob(val));
          forgetImageUrl(key);
          savedCoin[flag] = true;
        } else if (!val && savedCoin[flag]) {
          await dbDeleteImage(key);
          forgetImageUrl(key);
          savedCoin[flag] = false;
        }
      } catch (err) { console.error('Error guardando imagen', err); alert('No se pudo guardar una de las imágenes.'); }
    }
  }

  pruneEmpty();
  await persistMeta();
  currentCountryId = country.id;
  if (albumPeriodId && savedCoin.periodId !== albumPeriodId) albumPeriodId = savedCoin.periodId || '';
  saveCoins(savedCoin);
  closeCreateModal();
}

/* ----- Importar CSV ----- */
function openImportModal() {
  document.getElementById('import-csv-data').value = '';
  document.getElementById('import-modal').classList.remove('hidden');
}

function closeImportModal() {
  document.getElementById('import-modal').classList.add('hidden');
}

function handleCSVFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) { document.getElementById('import-csv-data').value = e.target.result; };
  reader.readAsText(file, 'UTF-8');
}

function processCSVImport() {
  const raw = document.getElementById('import-csv-data').value.trim();
  if (!raw) return;

  const imported = [];
  let skipped = 0, invalid = 0;
  for (let line of raw.split(/\r?\n/)) {
    line = line.replace(/^﻿/, '').trim();
    const norm = line.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (!line || /^pais\s*[;,]/.test(norm)) continue;   // cabecera ("país;período;…"); no confundir con "Países Bajos"

    const delimiter = line.includes(';') ? ';' : ',';
    const parts = line.split(delimiter).map(p => p.trim());
    if (parts.length < 7 || !parts[0]) { invalid++; continue; }

    const country = getOrCreateCountry(parts[0]);
    const period = getOrCreatePeriod(country.id, parts[1] || 'General');
    const rarity = RARITIES.includes(parts[4].toUpperCase()) ? parts[4].toUpperCase() : 'C';
    const dup = coins.some(x => x.periodId === period.id && normName(x.denom) === normName(parts[2]) &&
      normName(x.km) === normName(parts[6]) && normName(x.range) === normName(parts[5]) && normName(x.cecaMaterial) === normName(parts[3]));
    if (dup) { skipped++; continue; }
    const coin = {
      id: newId(), countryId: country.id, periodId: period.id,
      denom: parts[2], cecaMaterial: parts[3], rarity, type: DEFAULT_COIN_TYPE, range: parts[5], km: parts[6],
      numistaUrl: '', ucoinUrl: '', acquired: false, year: '', grade: '', hasFront: false, hasBack: false,
      order: nextCoinOrder(period.id), silverWeight: '', silverPurity: '900'
    };
    coins.push(coin);
    imported.push(coin);
    currentCountryId = country.id;
    albumPeriodId = ''; albumGroup = '';
  }

  if (imported.length > 0) {
    persistMeta();
    saveCoins(imported);
    closeImportModal();
    const notes = [];
    if (skipped > 0) notes.push(`${skipped} ya existían y se han omitido`);
    if (invalid > 0) notes.push(`${invalid} ${invalid === 1 ? 'línea no tenía' : 'líneas no tenían'} las 7 columnas y se ${invalid === 1 ? 'ha ignorado' : 'han ignorado'}`);
    if (notes.length) alert(`${imported.length} monedas añadidas. ${notes.join('. ')}.`);
  } else {
    if (pruneEmpty()) persistMeta();   // quita países/períodos creados al leer filas que se han omitido
    alert(skipped > 0 && invalid === 0 ? 'Todas las monedas del CSV ya estaban en tu colección.' : 'Formato CSV no válido: cada línea necesita 7 columnas (país;período;denominación;ceca;rareza;rango;KM#).');
  }
}
