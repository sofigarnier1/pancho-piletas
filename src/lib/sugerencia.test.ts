import { describe, expect, it } from 'vitest';
import { sugerirDia, type PoolSug, type VisitaSug } from './sugerencia';

const F = '2026-11-17'; // martes
const pool = (id: string, over: Partial<PoolSug> = {}): PoolSug => ({
  id, numero: Number(id.replace(/\D/g, '')) || null, cliente: `Cliente ${id}`, lugar: `Calle ${id}`, barrio: 'San Isidro',
  frequency: 'semanal', lat: null, lng: null, ...over,
});
const v = (poolId: string, date: string, over: Partial<VisitaSug> = {}): VisitaSug => ({ poolId, date, status: 'done', vehicleId: 'A', sortOrder: 0, ...over });
const autos = [{ id: 'A', name: 'Palio' }, { id: 'B', name: 'Kangoo' }];
const base = { fecha: F, autos, enElDia: [], pendientes: [] };
const ids = (g: ReturnType<typeof sugerirDia>) => g.map((x) => [x.vehicleName, x.items.map((i) => i.poolId)]);

describe('sugerirDia', () => {
  it('semanal: la del mismo día la semana pasada, en su auto y en su orden', () => {
    const g = sugerirDia({ ...base, pools: [pool('p1'), pool('p2'), pool('p3')], visitas: [
      v('p1', '2026-11-10', { sortOrder: 2 }), v('p2', '2026-11-10', { sortOrder: 1 }), v('p3', '2026-11-10', { vehicleId: 'B' }),
    ] });
    expect(ids(g)).toEqual([['Palio', ['p2', 'p1']], ['Kangoo', ['p3']]]);
    expect(g[0].items[0]).toMatchObject({ motivo: 'Fue el mismo día la semana pasada', marcada: true, prioridad: 2 });
  });

  it('quincenal y mensual miran 2 y 4 semanas atrás; hechas hace poco no van', () => {
    const g = sugerirDia({ ...base, pools: [pool('q', { frequency: 'quincenal' }), pool('m', { frequency: 'mensual' }), pool('r', { frequency: 'quincenal' })], visitas: [
      v('q', '2026-11-03'), v('m', '2026-10-20'), v('r', '2026-11-10'),
    ] });
    expect(g.flatMap((x) => x.items.map((i) => [i.poolId, i.motivo]))).toEqual([
      ['q', 'Fue el mismo día hace 2 semanas (quincenal)'],
      ['m', 'Fue el mismo día hace 4 semanas (mensual)'],
    ]);
  });

  it('"le toca" por días desde la última hecha, aunque haya sido otro día de la semana', () => {
    const g = sugerirDia({ ...base, pools: [pool('p1')], visitas: [v('p1', '2026-11-08')] });
    expect(g[0].items[0]).toMatchObject({ poolId: 'p1', prioridad: 3, motivo: 'Le toca: la última vez fue hace 9 días (semanal)' });
  });

  it('las sin hacer de la semana pasada van primero y marcadas; las que nunca tuvieron visitas, sin marcar', () => {
    const g = sugerirDia({ ...base, pools: [pool('p1'), pool('p2')], visitas: [v('p1', '2026-11-14', { status: 'skipped', vehicleId: 'B' })],
      pendientes: [{ poolId: 'p1', date: '2026-11-14', estado: 'Salteada' }] });
    const items = g.flatMap((x) => x.items);
    expect(items.find((i) => i.poolId === 'p1')).toMatchObject({ prioridad: 1, marcada: true, motivo: 'Quedó sin hacer el 14/11 (salteada)' });
    expect(g.find((x) => x.items.some((i) => i.poolId === 'p1'))!.vehicleName).toBe('Kangoo');
    expect(items.find((i) => i.poolId === 'p2')).toMatchObject({ prioridad: 4, marcada: false });
  });

  it('no sugiere las que ya están ese día ni las que tienen visita en los 3 días siguientes', () => {
    const g = sugerirDia({ ...base, pools: [pool('p1'), pool('p2')], visitas: [
      v('p1', '2026-11-10'), v('p2', '2026-11-10'), v('p2', '2026-11-19', { status: 'pending' }),
    ], enElDia: [{ poolId: 'p1', vehicleId: 'A', sortOrder: 0 }] });
    expect(g).toEqual([]);
  });

  it('sin referencia, va al auto que tiene piletas más cerca, y se intercala donde menos alarga', () => {
    const cerca = { lat: -34.47, lng: -58.52 };
    const lejos = { lat: -34.60, lng: -58.40 };
    const g = sugerirDia({ ...base,
      pools: [
        pool('a1', cerca), pool('b1', lejos),
        pool('n1', { lat: -34.471, lng: -58.521, frequency: 'semanal' }),
      ],
      visitas: [v('a1', '2026-11-10', { vehicleId: 'A' }), v('b1', '2026-11-10', { vehicleId: 'B' }), v('n1', '2026-11-05', { vehicleId: null })],
    });
    expect(ids(g)).toEqual([['Palio', ['a1', 'n1']], ['Kangoo', ['b1']]]);
  });

  it('sin coordenadas, junta por barrio; sin autos, todo va "Sin auto"', () => {
    const g = sugerirDia({ ...base, autos: [], pools: [pool('p1', { barrio: 'Tigre' }), pool('p2', { barrio: 'Olivos' })], visitas: [v('p1', '2026-11-08'), v('p2', '2026-11-08')] });
    expect(ids(g)).toEqual([['Sin auto', ['p2', 'p1']]]);
  });

  it('si el auto de la referencia ya no está activo, elige otro', () => {
    const g = sugerirDia({ ...base, autos: [{ id: 'B', name: 'Kangoo' }], pools: [pool('p1')], visitas: [v('p1', '2026-11-10', { vehicleId: 'A' })] });
    expect(ids(g)).toEqual([['Kangoo', ['p1']]]);
  });
});
