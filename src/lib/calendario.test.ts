import { describe, expect, it } from 'vitest';
import { resumenDia, semanasDelMes } from './calendario';

const HOY = '2026-11-07';
const v = (status: string, vehicle_id: string | null = 'a1') => ({ status, vehicle_id });

describe('resumenDia', () => {
  it('sin visitas: sin programar', () => {
    expect(resumenDia([], '2026-11-10', HOY)).toMatchObject({ estado: 'sin-programar', total: 0, sinHacer: 0 });
    expect(resumenDia([], '2026-11-01', HOY).estado).toBe('sin-programar');
  });
  it('hoy o un día que viene con pendientes: programado (y no cuenta "sin hacer")', () => {
    expect(resumenDia([v('pending'), v('done')], HOY, HOY)).toMatchObject({ estado: 'programado', total: 2, hechas: 1, sinHacer: 0 });
    expect(resumenDia([v('pending')], '2026-11-20', HOY).estado).toBe('programado');
  });
  it('día pasado con alguna pendiente: pendientes, con cuántas quedaron sin hacer', () => {
    expect(resumenDia([v('pending'), v('done'), v('pending')], '2026-11-06', HOY)).toMatchObject({ estado: 'pendientes', sinHacer: 2, hechas: 1 });
  });
  it('todas resueltas (hechas, salteadas o "no estaba"): terminado, también hoy', () => {
    expect(resumenDia([v('done'), v('skipped'), v('no_client')], '2026-11-03', HOY).estado).toBe('terminado');
    expect(resumenDia([v('done')], HOY, HOY).estado).toBe('terminado');
  });
  it('cuenta las visitas por auto (incluido "sin auto")', () => {
    const r = resumenDia([v('pending', 'a1'), v('pending', 'a1'), v('pending', null)], HOY, HOY);
    expect(r.porAuto).toEqual([{ vehicleId: 'a1', cantidad: 2 }, { vehicleId: null, cantidad: 1 }]);
  });
});

describe('semanasDelMes', () => {
  it('noviembre 2026: arranca el lunes 26/10 y termina el domingo 6/12, en semanas de 7 días', () => {
    const s = semanasDelMes(2026, 11);
    expect(s.every((w) => w.length === 7)).toBe(true);
    expect(s[0][0]).toEqual({ fecha: '2026-10-26', dia: 26, delMes: false });
    expect(s[0][6]).toEqual({ fecha: '2026-11-01', dia: 1, delMes: true });
    expect(s.at(-1)!.at(-1)).toEqual({ fecha: '2026-12-06', dia: 6, delMes: false });
    expect(s.flat().filter((c) => c.delMes)).toHaveLength(30);
  });
  it('un mes que empieza en lunes no agrega días del mes anterior (junio 2026)', () => {
    const s = semanasDelMes(2026, 6);
    expect(s[0][0]).toEqual({ fecha: '2026-06-01', dia: 1, delMes: true });
  });
  it('febrero y cambio de año', () => {
    expect(semanasDelMes(2027, 2).flat().filter((c) => c.delMes)).toHaveLength(28);
    const dic = semanasDelMes(2026, 12);
    expect(dic.at(-1)!.at(-1)!.fecha).toBe('2027-01-03');
  });
});
