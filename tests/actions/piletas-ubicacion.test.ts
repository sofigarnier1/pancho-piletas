import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// No se sale a internet: OpenStreetMap se simula
const buscar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ubicacion', async (orig) => ({ ...(await orig<typeof import('@/lib/ubicacion')>()), buscarDireccion: buscar }));

import type { TestUserKey } from '../../e2e/support/env';
import { guardarUbicacionAction, setPoolFrequencyAction, ubicarPiletaAction } from '@/app/admin/piletas/actions';
import { actAs, except, type ActionResult } from '../support/session';
import { svc, userIds } from '../support/clients';

let ids: Record<TestUserKey, string>;
let poolId: string;
let sinDir: string;
beforeAll(async () => {
  ids = await userIds();
  poolId = (await svc().from('pools').insert({ client_id: ids.client, address: 'Los Ceibos 120', neighborhood: 'San Isidro' }).select('id').single()).data!.id as string;
  sinDir = (await svc().from('pools').insert({ client_id: ids.client }).select('id').single()).data!.id as string;
});
afterAll(async () => { await svc().from('pools').delete().in('id', [poolId, sinDir]); });

const pool = async () => (await svc().from('pools').select('frequency, lat, lng, location_source').eq('id', poolId).single()).data!;
const r = (p: Promise<unknown>) => p as Promise<ActionResult>;

describe('frecuencia y ubicación de la pileta', () => {
  it('arranca semanal; el dueño la cambia; valores inventados no', async () => {
    expect((await pool()).frequency).toBe('semanal');
    await actAs('owner');
    expect((await r(setPoolFrequencyAction(poolId, 'quincenal'))).success).toBe(true);
    expect((await pool()).frequency).toBe('quincenal');
    expect((await r(setPoolFrequencyAction(poolId, 'anual'))).error).toBe('Datos inválidos');
  });

  it('"Ubicar en el mapa" busca solo la dirección y guarda el punto', async () => {
    buscar.mockResolvedValueOnce({ lat: -34.47, lng: -58.52 });
    await actAs('owner');
    expect((await r(ubicarPiletaAction(poolId))).success).toBe(true);
    expect(buscar).toHaveBeenLastCalledWith('Los Ceibos 120, San Isidro, Buenos Aires, Argentina');
    expect(await pool()).toMatchObject({ lat: -34.47, lng: -58.52, location_source: 'auto' });
  });

  it('si no la encuentra, o no hay dirección, lo dice', async () => {
    buscar.mockResolvedValueOnce(null);
    await actAs('owner');
    expect((await r(ubicarPiletaAction(poolId))).error).toMatch(/^No se encontró la dirección/);
    expect((await r(ubicarPiletaAction(sinDir))).error).toBe('La pileta no tiene dirección: cargala primero');
  });

  it('corregir a mano con un link de Google Maps; vacío la deja sin ubicar', async () => {
    await actAs('admin');
    expect((await r(guardarUbicacionAction(poolId, 'https://www.google.com/maps/place/x/@-34.4801,-58.5302,17z'))).success).toBe(true);
    expect(await pool()).toMatchObject({ lat: -34.4801, lng: -58.5302, location_source: 'manual' });
    expect((await r(guardarUbicacionAction(poolId, 'por ahí'))).error).toMatch(/^No se entienden las coordenadas/);
    expect((await r(guardarUbicacionAction(poolId, ''))).success).toBe(true);
    expect(await pool()).toMatchObject({ lat: null, lng: null, location_source: null });
  });

  it.each(except(['owner', 'admin']))('%s no puede cambiar frecuencia ni ubicación', async (actor) => {
    await actAs(actor);
    expect((await r(setPoolFrequencyAction(poolId, 'mensual'))).error).toBeTruthy();
    expect((await r(guardarUbicacionAction(poolId, '-34.1, -58.1'))).error).toBeTruthy();
    expect((await r(ubicarPiletaAction(poolId))).error).toBeTruthy();
    expect((await pool()).frequency).toBe('quincenal');
  });
});
