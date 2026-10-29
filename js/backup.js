/* ===== COPIAS DE SEGURIDAD =====
   Formato v2: { version: 2, countries, periods, coins } con las imágenes incrustadas (base64).
   Se siguen aceptando copias v1 (monedas con país/período en texto + preferences). */
async function exportBackup() {
  const stored = await getAllFromStore('coins');
  const allCoins = [];
  for (const c of stored) {
    const copy = { ...c, country: coinCountryName(c), period: coinPeriodName(c) };  // nombres solo por legibilidad
    for (const [flag, field, side] of [['hasFront', 'imgFront', 'front'], ['hasBack', 'imgBack', 'back']]) {
      if (c[flag]) {
        const blob = await dbGetImage(imgKey(c.id, side));
        copy[field] = blob ? await blobToDataURL(blob) : '';
      } else {
        copy[field] = '';
      }
    }
    allCoins.push(copy);
  }
  const backupData = { version: 2, date: new Date().toISOString(), countries, periods, zones: customZones, coins: allCoins };

  const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `PlazaMayor_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

  try { localStorage.setItem('numis_last_backup', new Date().toISOString()); } catch (e) {}
  updateBackupStatus();
}

function updateBackupStatus() {
  const el = document.getElementById('backup-status');
  if (!el) return;
  let last = null;
  try { last = localStorage.getItem('numis_last_backup'); } catch (e) {}
  if (!last) {
    el.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Sin copia de seguridad';
    el.className = 'text-[10px] text-red-400 font-semibold truncate px-1';
    return;
  }
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  if (days >= 14) {
    el.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Copia hace ${days}d`;
    el.className = 'text-[10px] text-amber-400 font-semibold truncate px-1';
  } else {
    el.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> Copia: ${days === 0 ? 'hoy' : 'hace ' + days + 'd'}`;
    el.className = 'text-[10px] text-emerald-400 font-semibold truncate px-1';
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
