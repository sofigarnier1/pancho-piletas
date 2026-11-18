import { describe, expect, it } from 'vitest';
import { chlorineTotalsText, describeHistory, marcasPorPersona, parseMes, summarizeWork, visitasPorDia, type HistoryRow, type WorkLog } from './staff-work';

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'b0000000-0000-4000-8000-000000000002';
let n = 0;
const log = (over: Partial<WorkLog>): WorkLog => ({
  id: `log-${++n}`, employee_id: A, itinerary_item_id: `item-${n}`, date: '2026-11-03', service_type: 'service',
  chlorine_type: null, chlorine_amount: null, ...over,
});

describe('parseMes', () => {
  it('toma el mes pedido con su primer y último día, y los vecinos', () => {
    const m = parseMes('2026-02', '2026-11-04');
    expect(m).toMatchObject({ mes: '2026-02', from: '2026-02-01', to: '2026-02-28', prev: '2026-01', next: '2026-03' });
    expect(m.label).toMatch(/^Febrero/);
  });
  it('cruza de año hacia los dos lados y sabe de bisiestos', () => {
    expect(parseMes('2026-01', '2026-11-04').prev).toBe('2025-12');
    expect(parseMes('2026-12', '2026-11-04').next).toBe('2027-01');
    expect(parseMes('2028-02', '2026-11-04').to).toBe('2028-02-29');
  });
  it('si el mes no es válido usa el de hoy', () => {
    for (const raw of [undefined, null, '', '2026-13', '2026-1', 'abc', '1800-01', "2026-11' or 1=1"]) {
      expect(parseMes(raw as string | undefined, '2026-11-04').mes).toBe('2026-11');
    }
  });
});

describe('summarizeWork', () => {
  it('cuenta una visita una vez por persona aunque tenga varios registros, y a cada persona que fue', () => {
    const w = summarizeWork([
      log({ itinerary_item_id: 'v1' }),
      log({ itinerary_item_id: 'v1' }), // segundo registro de A en la misma visita
      log({ itinerary_item_id: 'v1', employee_id: B }), // B también fue
      log({ itinerary_item_id: 'v2', service_type: 'desagote', date: '2026-11-04' }),
    ]);
    expect(w.get(A)).toMatchObject({ visits: 2, service: 1, desagote: 1, days: 2, logs: 3 });
    expect(w.get(B)).toMatchObject({ visits: 1, service: 1, desagote: 0, days: 1, logs: 1 });
  });

  it('un registro sin visita del itinerario cuenta como una visita propia', () => {
    const w = summarizeWork([log({ itinerary_item_id: null }), log({ itinerary_item_id: null })]);
    expect(w.get(A)?.visits).toBe(2);
  });

  it('suma el cloro por tipo sin convertir y cuenta los que no tienen cantidad', () => {
    const w = summarizeWork([
      log({ chlorine_type: 'liquido', chlorine_amount: '0.1' }),
      log({ chlorine_type: 'liquido', chlorine_amount: 0.2 }),
      log({ chlorine_type: 'pastilla', chlorine_amount: 1.5 }),
      log({ chlorine_type: 'pastilla', chlorine_amount: null }),
      log({ chlorine_type: 'granulado', chlorine_amount: null }),
      log({ chlorine_type: 'otro', chlorine_amount: 9 }),
    ]).get(A)!;
    expect(w.chlorine.liquido).toEqual({ amount: 0.3, withoutAmount: 0 });
    expect(w.chlorine.pastilla).toEqual({ amount: 1.5, withoutAmount: 1 });
    expect(w.chlorine.granulado).toEqual({ amount: 0, withoutAmount: 1 });
    expect(chlorineTotalsText(w.chlorine)).toEqual([
      'Líquido · 0,3 L',
      'Granulado (1 vez, sin cantidad)',
      'Pastillas · 1,5 (y 1 vez sin cantidad)',
    ]);
  });

  it('sin registros no hay nadie, y sin cloro no hay texto', () => {
    expect(summarizeWork([]).size).toBe(0);
    expect(chlorineTotalsText(summarizeWork([log({})]).get(A)!.chlorine)).toEqual([]);
  });
});

describe('describeHistory', () => {
  const names: Record<string, string> = { [A]: 'Juan', [B]: 'Pancho' };
  const nameOf = (id: string) => names[id] ?? '?';
  const base = { id: 'h1', service_log_id: 'l1', changed_by: B, changed_at: '2026-11-04T15:00:00Z' };
  const data = {
    id: 'l1', employee_id: A, pool_id: 'p1', itinerary_item_id: 'i1', date: '2026-11-03', service_type: 'service',
    chlorine_type: 'pastilla', chlorine_amount: 2, notes: null, updated_at: '2026-11-03T10:00:00Z', request_id: 'r1',
  };

  it('un alta muestra cómo quedó, sin datos internos', () => {
    const e = describeHistory({ ...base, action: 'insert', old_data: null, new_data: data } as HistoryRow, nameOf);
    expect(e).toMatchObject({ action: 'insert', verb: 'Registró', poolId: 'p1', itemId: 'i1', employeeId: A, logDate: '2026-11-03', changes: [] });
    expect(e.snapshot).toEqual([
      { field: 'Quién lo hizo', before: '', after: 'Juan' },
      { field: 'Fecha', before: '', after: '3/11/2026' },
      { field: 'Tipo de visita', before: '', after: 'Service' },
      { field: 'Cloro', before: '', after: 'Pastillas · 2' },
    ]);
  });

  it('una edición muestra solo lo que cambió, con el antes y el después', () => {
    const e = describeHistory({
      ...base, action: 'update', old_data: data,
      new_data: { ...data, employee_id: B, chlorine_amount: 2.5, notes: 'Agua verde', updated_at: '2026-11-04T15:00:00Z' },
    } as HistoryRow, nameOf);
    expect(e.verb).toBe('Editó');
    expect(e.snapshot).toEqual([]);
    expect(e.changes).toEqual([
      { field: 'Quién lo hizo', before: 'Juan', after: 'Pancho' },
      { field: 'Cloro', before: 'Pastillas · 2', after: 'Pastillas · 2,5' },
      { field: 'Observaciones', before: '—', after: 'Agua verde' },
    ]);
  });

  it('una edición de datos internos no muestra cambios', () => {
    const e = describeHistory({ ...base, action: 'update', old_data: data, new_data: { ...data, client_id: 'otro' } } as HistoryRow, nameOf);
    expect(e.changes).toEqual([]);
  });

  it('un borrado muestra cómo estaba', () => {
    const e = describeHistory({ ...base, action: 'delete', old_data: { ...data, chlorine_type: null, chlorine_amount: null }, new_data: null } as HistoryRow, nameOf);
    expect(e).toMatchObject({ action: 'delete', verb: 'Borró', poolId: 'p1', logDate: '2026-11-03' });
    expect(e.snapshot.find((f) => f.field === 'Cloro')?.after).toBe('Sin cloro');
  });
});

describe('visitasPorDia', () => {
  it('una visita cuenta una vez por persona y por día, aunque tenga varios registros', () => {
    const logs = [
      { id: '1', employee_id: 'a', itinerary_item_id: 'v1', date: '2026-11-02', service_type: 'service', chlorine_type: null, chlorine_amount: null },
      { id: '2', employee_id: 'a', itinerary_item_id: 'v1', date: '2026-11-02', service_type: 'service', chlorine_type: null, chlorine_amount: null },
      { id: '3', employee_id: 'a', itinerary_item_id: 'v2', date: '2026-11-02', service_type: 'service', chlorine_type: null, chlorine_amount: null },
      { id: '4', employee_id: 'b', itinerary_item_id: 'v1', date: '2026-11-02', service_type: 'service', chlorine_type: null, chlorine_amount: null },
      { id: '5', employee_id: 'a', itinerary_item_id: null, date: '2026-11-03', service_type: 'service', chlorine_type: null, chlorine_amount: null },
    ];
    const r = visitasPorDia(logs);
    expect(r.get('a')?.get('2026-11-02')).toBe(2);
    expect(r.get('a')?.get('2026-11-03')).toBe(1);
    expect(r.get('b')?.get('2026-11-02')).toBe(1);
  });
});

describe('marcasPorPersona', () => {
  it('cuenta salteadas y "no estaba" por quien las marcó; ignora las demás', () => {
    const r = marcasPorPersona([
      { status: 'skipped', completed_by: 'a' },
      { status: 'no_client', completed_by: 'a' },
      { status: 'skipped', completed_by: 'a' },
      { status: 'done', completed_by: 'a' },
      { status: 'skipped', completed_by: null },
    ]);
    expect(r.get('a')).toEqual({ salteadas: 2, noEstaba: 1 });
    expect(r.size).toBe(1);
  });
});
