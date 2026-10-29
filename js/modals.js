/* ===== VENTANAS: etiquetas, país/período, ficha, crear/editar, CSV ===== */

/* ----- Etiquetas (chips) ----- */
function allKnownTags() {
  const s = new Set();
  countries.forEach(c => (c.tags || []).forEach(t => s.add(t)));
  periods.forEach(p => (p.tags || []).forEach(t => s.add(t)));
  return [...s].sort();
}

function renderTagChips(boxId, inputId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const active = parseTags(document.getElementById(inputId).value);
  const all = [...new Set([...allKnownTags(), ...active])];
  box.innerHTML = all.map(t => `
    <button type="button" onclick="toggleTagInInput('${inputId}', '${boxId}', '${jsArg(t)}')" class="px-2 py-0.5 rounded-lg text-[10px] font-bold border transition ${active.includes(t) ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-900 text-slate-300 border-slate-700'}">${esc(t)}</button>
  `).join('');
}

function toggleTagInInput(inputId, boxId, tag) {
  const input = document.getElementById(inputId);
  const cur = parseTags(input.value);
  input.value = (cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag]).join(' ');
  renderTagChips(boxId, inputId);
}

/* ----- Editar país ----- */
function openEditCountryModal() {
  const country = countryById(currentCountryId);
  if (!country) return;
  document.getElementById('input-edit-country-name').value = country.name;
  document.getElementById('input-edit-country-tags').value = (country.tags || []).join(' ');
  renderTagChips('country-tag-chips', 'input-edit-country-tags');
  fillZoneSelect(country.continent || '');
  document.getElementById('input-edit-country-flag').value = country.flag || '';
  pendingFlagImage = undefined;
  updateFlagPreview();
  document.getElementById('edit-country-modal').classList.remove('hidden');
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

  country.name = newName;
  country.tags = parseTags(document.getElementById('input-edit-country-tags').value);
  const cont = document.getElementById('input-edit-country-continent').value;
  if (cont) country.continent = cont; else delete country.continent;
  persistMeta();
  closeEditCountryModal();
  render();
}

/* ----- Editar período ----- */
function openEditPeriodModal(periodId) {
  const p = periodById(periodId);
  if (!p) return;
  document.getElementById('input-edit-period-old').value = p.id;
  document.getElementById('input-edit-period-name').value = p.name;
  document.getElementById('input-edit-period-tags').value = (p.tags || []).join(' ');
  renderTagChips('period-tag-chips', 'input-edit-period-tags');
  document.getElementById('edit-period-modal').classList.remove('hidden');
}

function closeEditPeriodModal() {
  document.getElementById('edit-period-modal').classList.add('hidden');
}

function saveEditedPeriodName() {
  const p = periodById(document.getElementById('input-edit-period-old').value);
  const newName = document.getElementById('input-edit-period-name').value.trim();
  if (!p || !newName) { closeEditPeriodModal(); return; }

  const clash = periods.find(x => x.id !== p.id && x.countryId === p.countryId && normName(x.name) === normName(newName));
  if (clash) { alert('Ya existe un período con este nombre en este país.'); return; }

  p.name = newName;
  p.tags = parseTags(document.getElementById('input-edit-period-tags').value);
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
    matValue.className = 'text-[11px] font-black text-emerald-400 leading-tight truncate';
    matValue.innerText = computeCoinSilverValue(coin) || '0,00 €';
  } else {
    matLabel.innerText = 'CECA/VARIANTE';
    matValue.className = 'text-[11px] font-bold text-slate-100 leading-tight truncate';
    matValue.innerText = (coin.cecaMaterial && coin.cecaMaterial.trim() !== '') ? coin.cecaMaterial : '—';
  }
}

function openCoinModal(id) {
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

  const yearRange = parseYearRange(coin.range);
  document.getElementById('modal-year-label').innerText = yearRange ? `Año exacto (${yearRange.min}-${yearRange.max})` : 'Año exacto de la pieza';
  document.getElementById('modal-year-display').innerText = coin.year || (yearRange ? yearRange.min.toString() : '—');

  document.getElementById('silver-weight-input').value = coin.silverWeight || '';
  document.getElementById('silver-purity-input').value = coin.silverPurity || '900';
  const raritySelect = document.getElementById('modal-rarity-select');
  if (raritySelect) raritySelect.value = coin.rarity || 'C';

  renderGradePills(coin.grade);
  toggleSilverValuation(coin.rarity);

  const front = document.getElementById('modal-coin-front');
  const back = document.getElementById('modal-coin-back');
  let baseStyleClass = 'coin-base-style';
  const mat = (coin.cecaMaterial || '').toLowerCase();
  if (mat.includes('oro')) baseStyleClass = 'coin-oro-style';
  if (mat.includes('cobre') || mat.includes('bronce')) baseStyleClass = 'coin-cobre-style';

  front.className = `coin-front ${!coin.hasFront ? baseStyleClass : 'has-img'}`;
  back.className = `coin-back ${!coin.hasBack ? baseStyleClass : 'has-img'}`;
  const fallback = `<span class="text-xl font-black font-serif-numis">${esc(coin.denom)}</span>`;
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

function openNumistaLink() {
  const coin = coins.find(c => c.id === activeCoinId);
  if (coin && coin.numistaUrl && coin.numistaUrl.trim() !== '') window.open(coin.numistaUrl.trim(), '_blank');
  else alert('Sin enlace de Numista registrado para esta moneda.');
}

function openUcoinLink() {
  const coin = coins.find(c => c.id === activeCoinId);
  if (coin && coin.ucoinUrl && coin.ucoinUrl.trim() !== '') window.open(coin.ucoinUrl.trim(), '_blank');
  else alert('Sin enlace de Ucoin registrado para esta moneda.');
}

function changeYearStep(step) {
  const yearDisplay = document.getElementById('modal-year-display');
  let current = (parseInt(yearDisplay.innerText) || 1900) + step;
  current = Math.max(1000, Math.min(2050, current));

  const coin = coins.find(c => c.id === activeCoinId);
  if (coin) {
    const range = parseYearRange(coin.range);
    if (range) current = Math.max(range.min, Math.min(range.max, current));
  }
  yearDisplay.innerText = current;
  updateCoinStatus();
}

function renderGradePills(selectedGrade) {
  document.getElementById('grade-pills-container').innerHTML = GRADES.map(g => `
    <button onclick="selectGrade('${g}')" class="py-1 rounded-lg text-[10px] font-bold transition-all duration-200 border ${g === selectedGrade ? 'bg-amber-500 border-amber-400 text-slate-950 shadow scale-[1.02]' : 'bg-[#182132] border-slate-800 text-slate-300 hover:border-amber-400/50'}">
      ${g}
    </button>
  `).join('');
}

function selectGrade(grade) {
  const coin = coins.find(c => c.id === activeCoinId);
  if (!coin) return;
  if (coin.grade === grade) {
    coin.grade = '';
    coin.acquired = false;
  } else {
    coin.grade = grade;
    coin.acquired = true;
    const shownYear = document.getElementById('modal-year-display').innerText;
    if (!coin.year && /^\d{4}$/.test(shownYear)) coin.year = shownYear;
  }
  renderGradePills(coin.grade);
  saveCoins(coin);
}

function selectRarity(rarity) {
  const coin = coins.find(c => c.id === activeCoinId);
  if (!coin) return;
  coin.rarity = rarity;
  toggleSilverValuation(coin.rarity);
  setMaterialBox(coin);
  saveCoins(coin);
}

function updateCoinStatus() {
  const coin = coins.find(c => c.id === activeCoinId);
  if (!coin) return;
  coin.year = document.getElementById('modal-year-display').innerText;
  coin.acquired = Boolean(coin.grade && coin.grade.trim() !== '');
  saveCoins(coin);
}

async function deleteCurrentCoin() {
  if (!activeCoinId) return;
  if (!confirm('¿Eliminar de la colección?')) return;
  const id = activeCoinId;
  clearTimeout(silverSaveTimer);
  coins = coins.filter(c => c.id !== id);
  forgetImageUrl(imgKey(id, 'front')); forgetImageUrl(imgKey(id, 'back'));
  await deleteCoinFromDB(id);
  if (pruneEmpty()) await persistMeta();
  activeCoinId = null;
  closeModal();
  render();
}

/* ----- Crear / editar ficha ----- */
function openCreateModal() {
  document.getElementById('edit-coin-id').value = '';
  document.getElementById('create-modal-title').innerText = 'Añadir Hueco al Álbum';
  document.getElementById('create-form').reset();
  document.getElementById('new-img-front').value = '';
  document.getElementById('new-img-back').value = '';
  document.getElementById('label-file-front').innerText = 'JPG, PNG, WEBP';
  document.getElementById('label-file-back').innerText = 'JPG, PNG, WEBP';
  const country = countryById(currentCountryId);
  document.getElementById('new-country').value = country ? country.name : '';
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
  let skipped = 0;
  for (let line of raw.split(/\r?\n/)) {
    line = line.replace(/^﻿/, '').trim();
    const norm = line.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (!line || norm.startsWith('pais')) continue;

    const delimiter = line.includes(';') ? ';' : ',';
    const parts = line.split(delimiter).map(p => p.trim());
    if (parts.length < 7 || !parts[0]) continue;

    const country = getOrCreateCountry(parts[0]);
    const period = getOrCreatePeriod(country.id, parts[1] || 'General');
    const rarity = RARITIES.includes(parts[4].toUpperCase()) ? parts[4].toUpperCase() : 'C';
    const dup = coins.some(x => x.periodId === period.id && normName(x.denom) === normName(parts[2]) &&
      normName(x.km) === normName(parts[6]) && normName(x.range) === normName(parts[5]) && normName(x.cecaMaterial) === normName(parts[3]));
    if (dup) { skipped++; continue; }
    const coin = {
      id: newId(), countryId: country.id, periodId: period.id,
      denom: parts[2], cecaMaterial: parts[3], rarity, range: parts[5], km: parts[6],
      numistaUrl: '', ucoinUrl: '', acquired: false, year: '', grade: '', hasFront: false, hasBack: false,
      order: nextCoinOrder(period.id), silverWeight: '', silverPurity: '900'
    };
    coins.push(coin);
    imported.push(coin);
    currentCountryId = country.id;
    albumPeriodId = '';
  }

  if (imported.length > 0) {
    persistMeta();
    saveCoins(imported);
    closeImportModal();
    if (skipped > 0) alert(`${imported.length} monedas añadidas. ${skipped} ya existían y se han omitido.`);
  } else {
    if (pruneEmpty()) persistMeta();   // quita países/períodos creados al leer filas que se han omitido
    alert(skipped > 0 ? 'Todas las monedas del CSV ya estaban en tu colección.' : 'Formato CSV no válido.');
  }
}
