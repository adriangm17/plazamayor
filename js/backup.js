/* ===== COPIAS DE SEGURIDAD =====
   Formato v2: { version: 2, countries, periods, coins } con las imágenes incrustadas (base64).
   Se siguen aceptando copias v1 (monedas con país/período en texto + preferences). */
async function exportBackup() {
  // v8.53: la copia se arma por trozos (un Blob de fragmentos) en vez de un único texto gigante, para no quedarse sin memoria con bases grandes
  const st = document.getElementById('backup-status');
  const say = t => { if (st) st.textContent = t; };
  try {
    const stored = await getAllFromStore('coins');
    const parts = [`{"version":2,"date":${JSON.stringify(new Date().toISOString())},"countries":${JSON.stringify(countries)},"periods":${JSON.stringify(periods)},"zones":${JSON.stringify(customZones)},"zoneOrder":${JSON.stringify(zoneOrder)},"zoneContinents":${JSON.stringify(zoneContinents)},"coins":[`];
    let i = 0;
    for (const c of stored) {
      const copy = { ...c, country: coinCountryName(c), period: coinPeriodName(c) };  // nombres solo por legibilidad
      for (const [flag, field, side] of [['hasFront', 'imgFront', 'front'], ['hasBack', 'imgBack', 'back']]) {
        if (c[flag]) {
          let blob = null;
          try { blob = await dbGetImage(imgKey(c.id, side)); } catch (e) { blob = null; }
          copy[field] = blob ? await blobToDataURL(blob) : '';
        } else {
          copy[field] = '';
        }
      }
      parts.push((i ? ',' : '') + JSON.stringify(copy));
      if (++i % 50 === 0) { say(`Exportando ${i}/${stored.length}…`); await new Promise(r => setTimeout(r, 0)); }
    }
    parts.push(']}');
    const blob = new Blob(parts, { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `PlazaMayor_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    try { localStorage.setItem('numis_last_backup', new Date().toISOString()); } catch (e) {}
  } catch (err) {
    console.error('Exportar:', err);
    alert('No se pudo exportar la copia:\n' + ((err && err.message) || err) + '\n\nSi se repite, cierra otras pestañas/apps y prueba desde el ordenador.');
  }
  updateBackupStatus();
}

function updateBackupStatus() {
  const ver = document.getElementById('app-version');
  if (ver) ver.textContent = 'v' + APP_VERSION;
  const el = document.getElementById('backup-status');
  if (!el) return;
  let last = null;
  try { last = localStorage.getItem('numis_last_backup'); } catch (e) {}
  if (!last) {
    el.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Sin copia de seguridad';
    el.className = 'xh-status xh-bad';
    return;
  }
  const when = new Date(last);
  const days = Math.floor((Date.now() - when.getTime()) / 86400000);
  // v8.02: fecha y hora de la última copia (dd/mm/aaaa hh:mm)
  const fecha = isNaN(when.getTime()) ? '' : ' · ' + when.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + when.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (days >= 14) {
    el.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Copia hace ${days}d${fecha}`;
    el.className = 'xh-status xh-warn';
  } else {
    el.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> Copia: ${days === 0 ? 'hoy' : 'hace ' + days + 'd'}${fecha}`;
    el.className = 'xh-status xh-ok';
  }
}

function importBackup(event) {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup || !Array.isArray(backup.coins)) { alert('Archivo no válido.'); input.value = ''; return; }
      if (!confirm('Restaurar reemplazaría toda tu colección actual. ¿Continuar?')) { input.value = ''; return; }

      let list = backup.coins.filter(c => c && typeof c === 'object' && c.denom);
      list.forEach(c => { if (!c.id) c.id = newId(); });
      if (list.length === 0) { alert('El archivo no contiene monedas válidas.'); input.value = ''; return; }

      customZones = Array.isArray(backup.zones) ? backup.zones.filter(x => typeof x === 'string' && x.trim()) : [];
      saveCustomZones();
      zoneOrder = Array.isArray(backup.zoneOrder) ? backup.zoneOrder.filter(x => typeof x === 'string' && x.trim()) : [];
      saveZoneOrder();
      zoneContinents = (backup.zoneContinents && typeof backup.zoneContinents === 'object' && !Array.isArray(backup.zoneContinents)) ? backup.zoneContinents : {};
      saveZoneContinents();
      const isV2 = Number(backup.version) >= 2 && Array.isArray(backup.countries) && Array.isArray(backup.periods);
      if (isV2) {
        countries = backup.countries; periods = backup.periods; coins = list;
        repairReferences();
      } else {
        const res = migrateLegacy(list, backup.preferences);
        countries = res.countries; periods = res.periods; coins = res.coins;
      }
      await saveAllDataToDB({ coins, countries, periods }, { clearImages: true });
      try { localStorage.setItem('numis_seeded', '1'); } catch (e2) {}
      alert('Restaurado con éxito.');
      currentCountryId = null;
      await loadData();   // vuelve a leer de la BD y pasa las imágenes incrustadas al almacén de imágenes
    } catch (err) {
      console.error(err);
      alert('Error al leer el archivo de respaldo.');
      try { await loadData(); } catch (e3) {}
    }
    input.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}
