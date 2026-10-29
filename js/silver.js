/* ===== PRECIO Y VALOR DE LA PLATA ===== */
let currentSilverPricePerGram = 1.56;
let silverPriceSource = 'fallback';   // 'api' | 'manual' | 'fallback'

function computeCoinSilverValue(coin) {
  if (!coin || !coin.rarity || coin.rarity.toUpperCase() !== 'PLATA') return null;
  const weight = parseFloat(coin.silverWeight) || 0;
  let purity = parseFloat(coin.silverPurity) || 0;
  if (purity > 0 && purity <= 1) purity = purity * 1000;
  if (weight > 0 && purity > 0) {
    const val = weight * (purity / 1000) * currentSilverPricePerGram;
    return `${val.toFixed(2).replace('.', ',')} €`;
  }
  return '0,00 €';
}

function updateSilverDisplay() {
  const display = document.getElementById('silver-price-rate-display');
  if (!display) return;
  const price = currentSilverPricePerGram.toFixed(2).replace('.', ',');
  display.innerText = silverPriceSource === 'api'
    ? `Plata: ${price} €/g`
    : `Plata: ${price} €/g · ${silverPriceSource === 'manual' ? 'manual' : 'aprox.'} · editar`;
}

function editSilverPrice() {
  const current = currentSilverPricePerGram.toFixed(2).replace('.', ',');
  const input = prompt('Precio de la plata fina (€/g):', current);
  if (input === null) return;
  const value = parseFloat(String(input).replace(',', '.'));
  if (!isFinite(value) || value <= 0) { alert('Introduce un valor numérico válido.'); return; }
  currentSilverPricePerGram = value;
  silverPriceSource = 'manual';
  try { localStorage.setItem('numis_silver_price', String(value)); } catch (e) {}
  updateSilverDisplay();
  calculateSilverValue(false);
  render();
}

async function fetchSilverPrice() {
  try {
    const saved = parseFloat(localStorage.getItem('numis_silver_price'));
    if (isFinite(saved) && saved > 0) { currentSilverPricePerGram = saved; silverPriceSource = 'manual'; }
  } catch (e) {}

  if (silverPriceSource === 'manual') {   // el precio fijado a mano manda sobre la cotización automática
    updateSilverDisplay();
    calculateSilverValue(false);
    render();
    return;
  }

  try {
    const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
    let usdToEur = 0.92;
    if (fxRes.ok) {
      const fxData = await fxRes.json();
      if (fxData && fxData.rates && fxData.rates.EUR) usdToEur = parseFloat(fxData.rates.EUR);
    }
    const metalsRes = await fetch('https://data-asg.goldprice.org/dbXRates/USD');
    if (metalsRes.ok) {
      const metalsData = await metalsRes.json();
      if (metalsData && metalsData.items && metalsData.items[0] && metalsData.items[0].xagPrice) {
        const eurPerGram = parseFloat(metalsData.items[0].xagPrice) * usdToEur / 31.1034768;
        if (isFinite(eurPerGram) && eurPerGram > 0.5) {
          currentSilverPricePerGram = eurPerGram;
          silverPriceSource = 'api';
        }
      }
    }
  } catch (err) {
    console.warn('Usando cotización local:', err);
  }

  updateSilverDisplay();
  calculateSilverValue(false);
  render();
}
