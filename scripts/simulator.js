/**
 * Simulador de sensores TerraSmart.
 * Envía lecturas al API cada N segundos (por defecto 15) para ver la app "en vivo".
 *
 * Uso:  npm run simulate
 */
import 'dotenv/config';

const API = process.env.API_URL ?? 'http://localhost:4000';
const KEY = process.env.DEVICE_KEY ?? 'terra-device-key';
const EVERY = Number(process.env.SIM_INTERVAL_MS ?? 15000);

const devices = [
  { code: 'TS-01', moisture: 52, battery: 77 },
  { code: 'TS-02', moisture: 34, battery: 15 },
];

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

async function tick() {
  for (const d of devices) {
    d.moisture = clamp(d.moisture + (Math.random() - 0.62) * 4, 8, 88);
    d.battery = clamp(d.battery - (Math.random() < 0.2 ? 1 : 0), 1, 100);

    try {
      const res = await fetch(`${API}/api/devices/${d.code}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-key': KEY },
        body: JSON.stringify({
          moisture: Math.round(d.moisture),
          temperature: Math.round((22 + Math.random() * 5) * 10) / 10,
          battery: d.battery,
        }),
      });
      const body = await res.json().catch(() => ({}));
      console.log(`[${new Date().toLocaleTimeString('es-MX')}] ${d.code} → ${Math.round(d.moisture)}% ${res.ok ? 'ok' : `error ${res.status}`}`, body.error ?? '');
    } catch (err) {
      console.log(`[${new Date().toLocaleTimeString('es-MX')}] ${d.code} → sin conexión con el API (${err.message})`);
    }
  }
}

console.log(`Simulador TerraSmart → ${API} cada ${EVERY / 1000}s`);
await tick();
setInterval(tick, EVERY);
