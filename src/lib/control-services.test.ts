import { describe, expect, it } from 'vitest';
import { controlPorPileta, diasDesde, type ControlItem, type ControlLog } from './control-services';

const HOY = '2026-11-07';
const item = (id: string, date: string, status: string, pool = 'p1', service_type = 'service'): ControlItem =>
  ({ id, pool_id: pool, date, status, service_type, vehicle_id: null });
const log = (id: string, itemId: string | null, date: string, extra: Partial<ControlLog> = {}): ControlLog => ({
  id, itinerary_item_id: itemId, pool_id: 'p1', employee_id: 'e1', date, service_type: 'service',
  chlorine_type: null, chlorine_amount: null, notes: null, ...extra,
});

describe('controlPorPileta', () => {
  it('cuenta las veces que se fue, por tipo, y lo que no se hizo', () => {
    const items = [
      item('a', '2026-11-02', 'done'),
      item('b', '2026-11-03', 'done', 'p1', 'desagote'),
      item('c', '2026-11-04', 'skipped'),
      item('d', '2026-11-05', 'no_client'),
      item('e', '2026-11-06', 'pending'),
      item('f', '2026-11-09', 'pending'),
    ];
    const logs = [
      log('1', 'a', '2026-11-02', { chlorine_type: 'liquido', chlorine_amount: 5 }),
      log('2', 'a', '2026-11-02', { employee_id: 'e2', chlorine_type: 'liquido', chlorine_amount: '2.5' }),
      log('3', 'b', '2026-11-03', { service_type: 'desagote' }),
    ];
    const c = controlPorPileta(items, logs, HOY).get('p1')!;
    expect(c).toMatchObject({
      fuimos: 2, services: 1, desagotes: 1, salteadas: 1, noEstaba: 1, sinHacer: 1, programadas: 1,
      liquido: 7.5, granulado: 0, pastillas: 0, ultima: '2026-11-03',
    });
    expect(c.visitas.map((v) => v.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']);
    expect(c.visitas[0]).toMatchObject({ itemId: 'a', status: 'done', empleados: ['e1', 'e2'] });
  });

  it('suma granulado y pastillas por separado e ignora cantidades vacías', () => {
    const items = [item('a', '2026-11-02', 'done'), item('b', '2026-11-03', 'done')];
    const logs = [
      log('1', 'a', '2026-11-02', { chlorine_type: 'granulado', chlorine_amount: 500 }),
      log('2', 'b', '2026-11-03', { chlorine_type: 'pastilla', chlorine_amount: 1.5 }),
      log('3', 'b', '2026-11-03', { chlorine_type: 'pastilla', chlorine_amount: null }),
    ];
    expect(controlPorPileta(items, logs, HOY).get('p1')).toMatchObject({ granulado: 500, pastillas: 1.5, fuimos: 2 });
  });

  it('un registro sin visita del itinerario cuenta como una visita aparte; una visita con registro cuenta como hecha aunque diga salteada', () => {
    const items = [item('a', '2026-11-02', 'skipped')];
    const logs = [log('1', 'a', '2026-11-02'), log('2', null, '2026-11-05', { notes: ' agua verde ' })];
    const c = controlPorPileta(items, logs, HOY).get('p1')!;
    expect(c).toMatchObject({ fuimos: 2, salteadas: 0, ultima: '2026-11-05' });
    expect(c.visitas[1]).toMatchObject({ itemId: null, notas: ['agua verde'] });
  });

  it('separa por pileta', () => {
    const r = controlPorPileta([item('a', '2026-11-02', 'pending', 'p1'), item('b', '2026-11-02', 'pending', 'p2')], [], HOY);
    expect(r.size).toBe(2);
    expect(r.get('p2')!.sinHacer).toBe(1);
  });
});

describe('diasDesde', () => {
  it('días entre la última visita y hoy', () => {
    expect(diasDesde('2026-11-02', HOY)).toBe(5);
    expect(diasDesde(HOY, HOY)).toBe(0);
    expect(diasDesde(null, HOY)).toBeNull();
  });
});
