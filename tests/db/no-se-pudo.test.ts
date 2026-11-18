/**
 * Migración 28: nota cuando una visita "no se pudo" (itinerary_items.status_note).
 *  - el empleado la deja al marcar salteada o "no estaba"
 *  - la base la borra si la visita vuelve a pendiente o queda hecha
 *  - hasta 500 caracteres; vacía = sin nota
 *  - no se saltea el encargado: si la visita le toca a otro, no la puede tocar
 * Migración 29: las tablas que miran las pantallas "En vivo" están publicadas para Realtime.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { TestUserKey } from '../../e2e/support/env';
import { getLocalSupabase } from '../../e2e/support/env';
import { as, svc, userIds } from '../support/clients';
import { addDays, todayInArgentina } from '@/lib/dates';

let ids: Record<TestUserKey, string>;
const FECHA = addDays(todayInArgentina(), -1);
const pools: string[] = [];
const items: string[] = [];
let dayId: string;

beforeAll(async () => {
  ids = await userIds();
  const { data: ps, error: pe } = await svc()
    .from('pools')
    .insert(['A', 'B'].map((n) => ({ client_id: ids.client, address: `No se pudo ${n} ${Date.now()}` })))
    .select('id');
  if (pe) throw pe;
  pools.push(...ps!.map((p) => p.id as string));
  dayId = (await svc().from('itinerary_days').upsert({ date: FECHA }, { onConflict: 'date' }).select('id').single()).data!.id as string;
  const { data: its, error } = await svc()
    .from('itinerary_items')
    .insert([
      // sin auto ni encargado: la ve y la marca cualquiera
      { itinerary_day_id: dayId, pool_id: pools[0], sort_order: 950 },
      // sin auto, le toca al dueño: el empleado no la puede marcar
      { itinerary_day_id: dayId, pool_id: pools[1], sort_order: 951, assigned_employee_id: ids.owner },
    ])
    .select('id, pool_id');
  if (error) throw error;
  for (const i of its!) items[pools.indexOf(i.pool_id as string)] = i.id as string;
});

afterAll(async () => {
  await svc().from('service_logs').delete().in('pool_id', pools);
  await svc().from('itinerary_items').delete().in('pool_id', pools);
  await svc().from('pools').delete().in('id', pools);
});

const item = async (idx: number) =>
  (await svc().from('itinerary_items').select('status, status_note, completed_by').eq('id', items[idx]).single()).data!;

describe('nota de "no se pudo"', () => {
  it('el empleado la deja al marcar "no estaba"; la base le saca los espacios de los bordes', async () => {
    const emp = await as('employee');
    const { error } = await emp.from('itinerary_items').update({ status: 'no_client', status_note: '  Portón cerrado  ' }).eq('id', items[0]);
    expect(error).toBeNull();
    expect(await item(0)).toMatchObject({ status: 'no_client', status_note: 'Portón cerrado', completed_by: ids.employee });
  });

  it('puede cambiarla mientras sigue sin hacerse (salteada)', async () => {
    const emp = await as('employee');
    await emp.from('itinerary_items').update({ status: 'skipped', status_note: 'Llovía' }).eq('id', items[0]);
    expect(await item(0)).toMatchObject({ status: 'skipped', status_note: 'Llovía' });
  });

  it('una nota vacía queda sin nota', async () => {
    const emp = await as('employee');
    await emp.from('itinerary_items').update({ status_note: '   ' }).eq('id', items[0]);
    expect((await item(0)).status_note).toBeNull();
  });

  it('al volver a pendiente la nota se borra, aunque se mande una', async () => {
    const emp = await as('employee');
    await emp.from('itinerary_items').update({ status: 'skipped', status_note: 'Llovía' }).eq('id', items[0]);
    await emp.from('itinerary_items').update({ status: 'pending', status_note: 'no debería quedar' }).eq('id', items[0]);
    expect(await item(0)).toMatchObject({ status: 'pending', status_note: null });
  });

  it('una visita pendiente no guarda nota', async () => {
    const emp = await as('employee');
    await emp.from('itinerary_items').update({ status_note: 'en pendiente' }).eq('id', items[0]);
    expect((await item(0)).status_note).toBeNull();
  });

  it('si al final se hizo (se registra el service), la nota se borra', async () => {
    const emp = await as('employee');
    await emp.from('itinerary_items').update({ status: 'no_client', status_note: 'No había nadie' }).eq('id', items[0]);
    const { error } = await emp.from('service_logs').insert({
      itinerary_item_id: items[0], employee_id: ids.employee, pool_id: pools[0], client_id: ids.client, request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    expect(await item(0)).toMatchObject({ status: 'done', status_note: null });
  });

  it('más de 500 caracteres se rechaza', async () => {
    const { error } = await svc().from('itinerary_items').update({ status: 'skipped', status_note: 'x'.repeat(501) }).eq('id', items[1]);
    expect(error?.code).toBe('23514');
    const ok = await svc().from('itinerary_items').update({ status: 'skipped', status_note: 'x'.repeat(500) }).eq('id', items[1]);
    expect(ok.error).toBeNull();
    await svc().from('itinerary_items').update({ status: 'pending' }).eq('id', items[1]);
  });

  it('el empleado no puede marcar ni dejar nota en una visita que le toca a otro', async () => {
    const emp = await as('employee');
    const { data } = await emp.from('itinerary_items').update({ status: 'skipped', status_note: 'intento' }).eq('id', items[1]).select('id');
    expect(data ?? []).toEqual([]);
    expect(await item(1)).toMatchObject({ status: 'pending', status_note: null });
  });

  it('el dueño también puede dejar la nota', async () => {
    const owner = await as('owner');
    const { error } = await owner.from('itinerary_items').update({ status: 'skipped', status_note: 'Lo reprogramo el jueves' }).eq('id', items[1]);
    expect(error).toBeNull();
    expect((await item(1)).status_note).toBe('Lo reprogramo el jueves');
  });
});

describe('tiempo real (migración 29)', () => {
  it('itinerary_items y service_logs están en la publicación de Realtime', async () => {
    const db = new pg.Client({ connectionString: getLocalSupabase().dbUrl });
    await db.connect();
    try {
      const { rows } = await db.query<{ tablename: string }>(
        `select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' order by tablename`,
      );
      expect(rows.map((r) => r.tablename)).toEqual(expect.arrayContaining(['itinerary_items', 'service_logs']));
    } finally {
      await db.end();
    }
  });
});
