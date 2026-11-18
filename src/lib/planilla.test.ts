import { describe, expect, it } from 'vitest';
import { buildPlanilla, markOf, weekOfMonth, weekRanges, type PlanillaItem } from './planilla';

const pool = (over: Partial<PlanillaItem['pool']> = {}): PlanillaItem['pool'] => ({
  nickname: null, address: 'Calle 1', neighborhood: 'San Isidro', clientName: 'Ana', clientNumber: 5, ...over,
});
let n = 0;
const item = (over: Partial<PlanillaItem>): PlanillaItem => ({
  id: `i${++n}`, date: '2026-11-03', status: 'done', service_type: 'service', pool_id: 'p1', pool: pool(), ...over,
});

describe('semanas del mes', () => {
  it('cada tramo de 7 días es una semana; del 29 en adelante, la quinta', () => {
    expect(['2026-11-01', '2026-11-07', '2026-11-08', '2026-11-21', '2026-11-22', '2026-11-28', '2026-11-29', '2026-11-30'].map(weekOfMonth))
      .toEqual([0, 0, 1, 2, 3, 3, 4, 4]);
  });
  it('los rangos se ajustan al largo del mes', () => {
    expect(weekRanges('2026-11-01', '2026-11-30')).toEqual(['1–7', '8–14', '15–21', '22–28', '29–30']);
    expect(weekRanges('2026-02-01', '2026-02-28')).toEqual(['1–7', '8–14', '15–21', '22–28', null]);
    expect(weekRanges('2028-02-01', '2028-02-29')).toEqual(['1–7', '8–14', '15–21', '22–28', '29']);
    expect(weekRanges('2026-12-01', '2026-12-31')[4]).toBe('29–31');
  });
});

describe('marcas', () => {
  it('hecha distingue service y desagote', () => {
    expect(markOf('done', 'service')).toBe('S');
    expect(markOf('done', null)).toBe('S');
    expect(markOf('done', 'desagote')).toBe('D');
    expect(markOf('skipped', 'service')).toBe('X');
    expect(markOf('no_client', 'desagote')).toBe('NE');
    expect(markOf('pending', 'service')).toBe('·');
  });
});

describe('buildPlanilla', () => {
  it('una fila por pileta con sus visitas en la semana que corresponde, en orden de fecha', () => {
    const rows = buildPlanilla([
      item({ date: '2026-11-10', pool_id: 'p1' }),
      item({ date: '2026-11-03', pool_id: 'p1' }),
      item({ date: '2026-11-17', pool_id: 'p1', status: 'skipped' }),
      item({ date: '2026-11-24', pool_id: 'p1', status: 'pending' }),
      item({ date: '2026-11-04', pool_id: 'p1', service_type: 'desagote' }), // dos visitas la misma semana
    ], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].weeks.map((w) => w.map((c) => `${c.mark}${c.date.slice(8)}`))).toEqual([['S03', 'D04'], ['S10'], ['X17'], ['·24'], []]);
    expect(rows[0].done).toBe(3);
    expect(rows[0]).toMatchObject({ number: 5, client: 'Ana', address: 'Calle 1, San Isidro' });
  });

  it('ordena por N° de cliente, los sin N° al final por nombre', () => {
    const rows = buildPlanilla([
      item({ pool_id: 'a', pool: pool({ clientNumber: null, clientName: 'Zoe' }) }),
      item({ pool_id: 'b', pool: pool({ clientNumber: 12, clientName: 'Beto' }) }),
      item({ pool_id: 'c', pool: pool({ clientNumber: null, clientName: 'Ana' }) }),
      item({ pool_id: 'd', pool: pool({ clientNumber: 3, clientName: 'Carla' }) }),
    ], []);
    expect(rows.map((r) => r.client)).toEqual(['Carla', 'Beto', 'Ana', 'Zoe']);
  });

  it('sin dirección usa el alias, y sin cliente lo dice', () => {
    const [r] = buildPlanilla([item({ pool: pool({ address: null, nickname: 'Quinta', neighborhood: null, clientName: null }) })], []);
    expect(r).toMatchObject({ address: 'Quinta', client: 'Sin cliente' });
  });

  it('suma el cloro de las visitas del mes de cada pileta, sin contar registros de otras visitas', () => {
    const a = item({ id: 'va', pool_id: 'p1' });
    const b = item({ id: 'vb', pool_id: 'p1', date: '2026-11-10' });
    const rows = buildPlanilla([a, b], [
      { itinerary_item_id: 'va', pool_id: 'p1', chlorine_type: 'pastilla', chlorine_amount: 1.5 },
      { itinerary_item_id: 'vb', pool_id: 'p1', chlorine_type: 'pastilla', chlorine_amount: '2' },
      { itinerary_item_id: 'vb', pool_id: 'p1', chlorine_type: 'liquido', chlorine_amount: null },
      { itinerary_item_id: 'otra', pool_id: 'p1', chlorine_type: 'granulado', chlorine_amount: 500 },
      { itinerary_item_id: null, pool_id: 'p1', chlorine_type: 'granulado', chlorine_amount: 500 },
    ]);
    expect(rows[0].chlorine).toEqual(['Líquido (1 vez, sin cantidad)', 'Pastillas · 3,5']);
  });

  it('sin visitas no hay filas', () => {
    expect(buildPlanilla([], [])).toEqual([]);
  });

  it('salen todas las piletas activas: las que no tienen visitas en el mes quedan "sin agendar", en su lugar por N°', () => {
    const rows = buildPlanilla(
      [item({ pool_id: 'p1', pool: pool({ clientNumber: 5, clientName: 'Ana' }) })],
      [],
      [
        { id: 'p1', ...pool({ clientNumber: 5, clientName: 'Ana' }) },
        { id: 'p2', ...pool({ clientNumber: 2, clientName: 'Beto', address: null, nickname: 'Quinta' }) },
      ],
    );
    expect(rows.map((r) => [r.client, r.sinAgendar])).toEqual([['Beto', true], ['Ana', false]]);
    expect(rows[0]).toMatchObject({ address: 'Quinta, San Isidro', done: 0, chlorine: [], weeks: [[], [], [], [], []] });
  });
});
