import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import type { TestUserKey } from '../../e2e/support/env';
import { reprogramarPendienteAction } from '@/app/admin/itinerario/actions';
import { actAs, except, type ActionResult } from '../support/session';
import { rand, svc, userIds } from '../support/clients';
import { addDays, todayInArgentina } from '@/lib/dates';

const HOY = todayInArgentina();
const DESTINO = addDays(HOY, 2);
let ids: Record<TestUserKey, string>;
let poolId: string;
let src: string;
let auto: string;

beforeAll(async () => {
  ids = await userIds();
  auto = (await svc().from('vehicles').insert({ name: rand('Reprog') }).select('id').single()).data!.id as string;
  poolId = (await svc().from('pools').insert({ client_id: ids.client, address: rand('Reprog pileta') }).select('id').single()).data!.id as string;
  const day = (await svc().from('itinerary_days').upsert({ date: addDays(HOY, -1) }, { onConflict: 'date' }).select('id').single()).data!.id as string;
  src = (await svc().from('itinerary_items').insert({ itinerary_day_id: day, pool_id: poolId, sort_order: 1, status: 'skipped', vehicle_id: auto, service_type: 'desagote' }).select('id').single()).data!.id as string;
});
afterAll(async () => {
  await svc().from('itinerary_items').update({ rescheduled_from_item_id: null }).eq('pool_id', poolId);
  await svc().from('itinerary_items').delete().eq('pool_id', poolId);
  await svc().from('pools').delete().eq('id', poolId);
  await svc().from('vehicles').delete().eq('id', auto);
});

const r = (p: Promise<unknown>) => p as Promise<ActionResult>;

describe('reprogramarPendienteAction', () => {
  it.each(except(['owner', 'admin']))('%s no puede reprogramar', async (actor) => {
    await actAs(actor);
    expect((await r(reprogramarPendienteAction(DESTINO, src))).error).toBeTruthy();
  });

  it('rechaza datos inválidos o una visita que no existe', async () => {
    await actAs('owner');
    expect((await r(reprogramarPendienteAction('mañana', src))).error).toBe('Datos inválidos');
    expect((await r(reprogramarPendienteAction(DESTINO, '00000000-0000-4000-8000-000000000000'))).error).toBe('Visita no encontrada');
  });

  it('la agrega al día, en su auto, con su tipo y la referencia a la original; dos veces no', async () => {
    await actAs('owner');
    expect((await r(reprogramarPendienteAction(DESTINO, src))).success).toBe(true);
    const { data } = await svc().from('itinerary_items').select('vehicle_id, service_type, status, itinerary_days(date)').eq('rescheduled_from_item_id', src).single();
    expect(data).toMatchObject({ vehicle_id: auto, service_type: 'desagote', status: 'pending', itinerary_days: { date: DESTINO } });
    expect((await r(reprogramarPendienteAction(addDays(DESTINO, 1), src))).error).toBe('Esa visita ya se volvió a agendar, o la pileta ya está ese día');
  });

  it('si el auto ya no está activo, va sin auto', async () => {
    const otraFuente = (await svc().from('itinerary_items').insert({
      itinerary_day_id: (await svc().from('itinerary_days').upsert({ date: addDays(HOY, -3) }, { onConflict: 'date' }).select('id').single()).data!.id,
      pool_id: poolId, sort_order: 2, status: 'no_client', vehicle_id: auto,
    }).select('id').single()).data!.id as string;
    await svc().from('vehicles').update({ is_active: false }).eq('id', auto);
    await actAs('owner');
    expect((await r(reprogramarPendienteAction(addDays(DESTINO, 5), otraFuente))).success).toBe(true);
    const { data } = await svc().from('itinerary_items').select('vehicle_id').eq('rescheduled_from_item_id', otraFuente).single();
    expect(data!.vehicle_id).toBeNull();
  });
});
