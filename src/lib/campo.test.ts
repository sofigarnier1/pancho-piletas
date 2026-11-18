import { describe, expect, it } from 'vitest';
import { esDeSuDia, esModoCampo } from './campo';

const YO = 'yo';
describe('esDeSuDia (misma regla que la base para el empleado)', () => {
  it('las suyas, siempre, aunque vayan en otro auto o sin auto', () => {
    expect(esDeSuDia({ vehicle_id: 'otro', assigned_employee_id: YO }, 'mio', YO)).toBe(true);
    expect(esDeSuDia({ vehicle_id: null, assigned_employee_id: YO }, null, YO)).toBe(true);
  });
  it('las de su auto, aunque le toquen a un compañero', () => {
    expect(esDeSuDia({ vehicle_id: 'mio', assigned_employee_id: null }, 'mio', YO)).toBe(true);
    expect(esDeSuDia({ vehicle_id: 'mio', assigned_employee_id: 'otro' }, 'mio', YO)).toBe(true);
  });
  it('no las de otro auto, ni las de un auto si él no va en ninguno', () => {
    expect(esDeSuDia({ vehicle_id: 'otro', assigned_employee_id: null }, 'mio', YO)).toBe(false);
    expect(esDeSuDia({ vehicle_id: 'otro', assigned_employee_id: null }, null, YO)).toBe(false);
  });
  it('sin auto: las que no tienen encargado, no las de un compañero', () => {
    expect(esDeSuDia({ vehicle_id: null, assigned_employee_id: null }, 'mio', YO)).toBe(true);
    expect(esDeSuDia({ vehicle_id: null, assigned_employee_id: 'otro' }, null, YO)).toBe(false);
  });
});

describe('esModoCampo', () => {
  it('solo el dueño y el súper admin', () => {
    expect(['owner', 'super_admin', 'employee', 'marketing', 'client', null].map(esModoCampo)).toEqual([true, true, false, false, false, false]);
  });
});
