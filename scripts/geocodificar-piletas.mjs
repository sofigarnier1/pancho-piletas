#!/usr/bin/env node
/**
 * Ubica en el mapa (OpenStreetMap / Nominatim) las piletas activas que tienen dirección y todavía no tienen coordenadas.
 * Se corre UNA vez (y después, de vez en cuando): las piletas nuevas se ubican con "Ubicar en el mapa" en su ficha.
 *
 * - Nominatim es gratis con un límite de 1 pedido por segundo: el script espera 1,1 s entre piletas.
 * - Solo manda la dirección, el barrio y la ciudad (nada del cliente).
 * - Por defecto NO escribe: muestra qué encontró. Con --guardar escribe lat/lng con location_source = 'auto'.
 *
 * Uso (usa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno; ojo: .env.local apunta a PRODUCCIÓN):
 *   node scripts/geocodificar-piletas.mjs            # ensayo
 *   node scripts/geocodificar-piletas.mjs --guardar  # guarda
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const guardar = process.argv.includes('--guardar');
const db = createClient(url, key, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { data: pools, error } = await db
  .from('pools')
  .select('id, address, neighborhood, city')
  .eq('is_active', true)
  .is('lat', null)
  .not('address', 'is', null);
if (error) throw error;
console.log(`${pools.length} piletas sin ubicar${guardar ? '' : ' (ensayo: no se guarda nada)'}`);

let ok = 0;
for (const p of pools) {
  if (!p.address?.trim()) continue;
  const q = [p.address.trim(), p.neighborhood?.trim(), p.city?.trim() || 'Buenos Aires', 'Argentina'].filter(Boolean).join(', ');
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '1', countrycodes: 'ar' })}`, {
    headers: { 'User-Agent': 'CloroYPiletasPancho-backoffice/1.0', 'Accept-Language': 'es' },
  }).catch(() => null);
  const hit = res?.ok ? (await res.json())[0] : null;
  if (hit) {
    ok++;
    console.log(`✔ ${q} → ${hit.lat}, ${hit.lon}`);
    if (guardar) {
      const { error: e } = await db.from('pools')
        .update({ lat: Number(hit.lat), lng: Number(hit.lon), located_at: new Date().toISOString(), location_source: 'auto' })
        .eq('id', p.id);
      if (e) console.error(`  no se guardó: ${e.message}`);
    }
  } else {
    console.log(`✘ ${q} → no se encontró (cargarla a mano en la ficha)`);
  }
  await sleep(1100);
}
console.log(`Listo: ${ok} de ${pools.length} encontradas.`);
