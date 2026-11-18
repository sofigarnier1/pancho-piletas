import { describe, expect, it } from 'vitest';
import { chlorineColumns } from './service-log';

describe('chlorineColumns', () => {
  it('sin cloro: no aplicado, sin tipo ni cantidad', () => {
    for (const t of [null, undefined, '']) {
      expect(chlorineColumns({ chlorineType: t as never, chlorineAmount: 5 })).toEqual({ chlorine_applied: false, chlorine_type: null, chlorine_amount: null, notes: null });
    }
  });

  it('con cloro: la cantidad es opcional', () => {
    expect(chlorineColumns({ chlorineType: 'pastilla', chlorineAmount: 1.5 })).toMatchObject({ chlorine_applied: true, chlorine_type: 'pastilla', chlorine_amount: 1.5 });
    expect(chlorineColumns({ chlorineType: 'liquido', chlorineAmount: null })).toMatchObject({ chlorine_applied: true, chlorine_amount: null });
  });

  it('rechaza un tipo desconocido y una cantidad fuera de la unidad', () => {
    expect(chlorineColumns({ chlorineType: 'acido', chlorineAmount: 1 })).toEqual({ error: 'Tipo de cloro inválido' });
    expect(chlorineColumns({ chlorineType: 'pastilla', chlorineAmount: 0.3 })).toEqual({ error: 'Cantidad de cloro inválida' });
    expect(chlorineColumns({ chlorineType: 'granulado', chlorineAmount: 10.5 })).toEqual({ error: 'Cantidad de cloro inválida' });
    expect(chlorineColumns({ chlorineType: 'liquido', chlorineAmount: 501 })).toEqual({ error: 'Cantidad de cloro inválida' });
  });

  it('las observaciones se recortan, se limitan a 1000 letras y vacías quedan en null', () => {
    expect(chlorineColumns({ chlorineType: null, chlorineAmount: null, notes: '  hola  ' })).toMatchObject({ notes: 'hola' });
    expect(chlorineColumns({ chlorineType: null, chlorineAmount: null, notes: '   ' })).toMatchObject({ notes: null });
    expect((chlorineColumns({ chlorineType: null, chlorineAmount: null, notes: 'x'.repeat(1500) }) as { notes: string }).notes).toHaveLength(1000);
  });
});
