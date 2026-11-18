#!/usr/bin/env node
/**
 * Comparação Google × Valhalla para rotas fixas da Grande Florianópolis.
 *
 * Para cada rota, calcula pelos dois motores usando AS MESMAS coordenadas
 * e confere se a diferença de distância fica abaixo do limite (padrão 20%).
 * Serve como argumento de que o Valhalla é uma alternativa viável ao Google.
 *
 * Uso (na raiz do easy-router):
 *   node scripts/compare-providers.mjs
 *
 * Variáveis:
 *   GOOGLE_MAPS_API_KEY  (se não vier, lê de backend/easyrouter-api/.env)
 *   ROUTER_MS_URL        (padrão http://localhost:3001)
 *   MAX_DIFF_PERCENT     (padrão 20)
 *
 * Atenção: cada execução faz 1 chamada paga à Routes API do Google por rota.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTER_MS_URL = process.env.ROUTER_MS_URL ?? 'http://localhost:3001';
const GOOGLE_ROUTES_URL = process.env.GOOGLE_ROUTES_URL ?? 'https://routes.googleapis.com/directions/v2:computeRoutes';
const MAX_DIFF_PERCENT = Number(process.env.MAX_DIFF_PERCENT ?? 20);

const ROUTES = [
  { name: 'Centro → Aeroporto', origin: [-27.5969, -48.5495], destination: [-27.6703, -48.5525] },
  { name: 'Centro → UFSC', origin: [-27.5969, -48.5495], destination: [-27.6003, -48.5196] },
  { name: 'Centro → Lagoa da Conceição', origin: [-27.5969, -48.5495], destination: [-27.6033, -48.4706] },
  { name: 'UFSC → Campeche', origin: [-27.6003, -48.5196], destination: [-27.6766, -48.4883] },
  { name: 'Centro → São José (Kobrasol)', origin: [-27.5969, -48.5495], destination: [-27.5945, -48.615] },
  { name: 'Biguaçu → Palhoça', origin: [-27.4942, -48.6556], destination: [-27.6455, -48.6697] },
];

function googleKey() {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY;
  try {
    const env = readFileSync(join(ROOT, 'backend/easyrouter-api/.env'), 'utf8');
    return env.match(/^GOOGLE_MAPS_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
  } catch {
    return undefined;
  }
}

async function viaGoogle(origin, destination, key) {
  const latLng = ([latitude, longitude]) => ({ location: { latLng: { latitude, longitude } } });
  const res = await fetch(GOOGLE_ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({ origin: latLng(origin), destination: latLng(destination), travelMode: 'DRIVE' }),
  });
  const data = await res.json();
  const route = data.routes?.[0];
  if (!res.ok || !route) throw new Error(data.error?.message ?? 'sem rota');
  return { km: route.distanceMeters / 1000, min: parseInt(route.duration, 10) / 60 };
}

async function viaValhalla(origin, destination) {
  const res = await fetch(`${ROUTER_MS_URL}/simple_route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return { km: data.distanceMeters / 1000, min: data.durationSeconds / 60 };
}

const key = googleKey();
if (!key) {
  console.error('GOOGLE_MAPS_API_KEY não encontrada (nem no ambiente, nem em backend/easyrouter-api/.env).');
  process.exit(2);
}

const rows = [];
let failures = 0;

for (const r of ROUTES) {
  try {
    const [g, v] = await Promise.all([viaGoogle(r.origin, r.destination, key), viaValhalla(r.origin, r.destination)]);
    const diff = (Math.abs(v.km - g.km) / g.km) * 100;
    const ok = diff <= MAX_DIFF_PERCENT;
    if (!ok) failures++;
    rows.push({
      Rota: r.name,
      'Google km': g.km.toFixed(2),
      'Valhalla km': v.km.toFixed(2),
      'Dif. km %': diff.toFixed(1),
      'Google min': Math.round(g.min),
      'Valhalla min': Math.round(v.min),
      OK: ok ? '✅' : '❌',
    });
  } catch (e) {
    failures++;
    rows.push({ Rota: r.name, OK: `❌ ${e.message}` });
  }
}

console.table(rows);
console.log(
  failures
    ? `\n❌ ${failures} rota(s) com diferença acima de ${MAX_DIFF_PERCENT}% ou com erro\n`
    : `\n✅ Todas as rotas com diferença de distância até ${MAX_DIFF_PERCENT}%\n`,
);
process.exit(failures ? 1 : 0);
