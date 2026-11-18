import { describe, expect, it } from 'vitest';
import {
  alcanzaPara, armarReporte, cantidadValida, formatCantidad, moverMes, nombreMes, parseCantidad, rangoMes, stockBajo,
  totalLinea, type FilaReporte,
} from './cloro';

describe('formatCantidad', () => {
  it('cada tipo en su unidad', () => {
    expect(formatCantidad('liquido', 12.5)).toBe('12,5 L');
    expect(formatCantidad('granulado', '3.000')).toBe('3 kg');
    expect(formatCantidad('pastilla', 1)).toBe('1 pastilla');
    expect(formatCantidad('pastilla', 40.5)).toBe('40,5 pastillas');
    expect(formatCantidad('granulado', 0.25)).toBe('0,25 kg');
  });
});

describe('parseCantidad', () => {
  it.each([
    ['2,5', 2.5], ['2.5', 2.5], ['1.000', 1000], ['1.000,5', 1000.5], ['0.250', 0.25], ['0,125', 0.125], [' 20 ', 20], ['3', 3],
  ])('%s → %s', (input, out) => expect(parseCantidad(input)).toBe(out));

  it.each(['', 'abc', '-2', '1,2345', '2,5,1', null, undefined])('%s → null', (input) =>
    expect(parseCantidad(input as string)).toBeNull());
});

describe('cantidadValida', () => {
  it('positiva, hasta 3 decimales y dentro del tope', () => {
    expect(cantidadValida('liquido', 0.5)).toBe(true);
    expect(cantidadValida('granulado', 0.125)).toBe(true);
    expect(cantidadValida('liquido', 0)).toBe(false);
    expect(cantidadValida('liquido', -1)).toBe(false);
    expect(cantidadValida('liquido', 1.0001)).toBe(false);
    expect(cantidadValida('liquido', 1_000_001)).toBe(false);
    expect(cantidadValida('liquido', null)).toBe(false);
  });
  it('pastillas: enteras o por mitades', () => {
    expect(cantidadValida('pastilla', 2.5)).toBe(true);
    expect(cantidadValida('pastilla', 2.25)).toBe(false);
  });
});

describe('alcanzaPara y stockBajo', () => {
  it('cuántas presentaciones enteras alcanzan', () => {
    expect(alcanzaPara(23, 5)).toBe(4);
    expect(alcanzaPara('10.000', '5')).toBe(2);
    expect(alcanzaPara(0.3, 0.1)).toBe(3); // sin errores de coma flotante
    expect(alcanzaPara(4, 5)).toBe(0);
    expect(alcanzaPara(4, null)).toBeNull();
  });
  it('aviso de stock bajo', () => {
    expect(stockBajo(5, 10)).toBe(true);
    expect(stockBajo(10, 10)).toBe(true);
    expect(stockBajo(11, 10)).toBe(false);
    expect(stockBajo(0, null)).toBe(false);
  });
});

it('totalLinea redondea como la base', () => {
  expect(totalLinea(2.5, 333)).toBe(833);
  expect(totalLinea(3, 1000)).toBe(3000);
});

describe('meses', () => {
  it('rangoMes', () => {
    expect(rangoMes('2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(rangoMes('2028-02')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(rangoMes('2026-13')).toBeNull();
    expect(rangoMes('2026-1')).toBeNull();
    expect(rangoMes(null)).toBeNull();
  });
  it('moverMes y nombreMes', () => {
    expect(moverMes('2026-01', -1)).toBe('2025-12');
    expect(moverMes('2026-12', 1)).toBe('2027-01');
    expect(nombreMes('2026-11')).toBe('noviembre de 2026');
  });
});

describe('armarReporte', () => {
  const filas: FilaReporte[] = [
    { chlorine_type: 'liquido', category: 'cloro', product_name: null, canal: 'service', origen: 'service', cantidad: '12.500', importe_cents: '50000', movimientos: 3 },
    { chlorine_type: 'liquido', category: 'cloro', product_name: null, canal: 'venta_service', origen: 'manual', cantidad: 10, importe_cents: 80000, movimientos: 1 },
    { chlorine_type: 'liquido', category: 'cloro', product_name: null, canal: 'venta_service', origen: 'online', cantidad: 5, importe_cents: 40000, movimientos: 1 },
    { chlorine_type: 'granulado', category: 'cloro', product_name: null, canal: 'mostrador', origen: 'manual', cantidad: 2, importe_cents: 30000, movimientos: 1 },
    { chlorine_type: null, category: 'accesorios', product_name: 'Barrefondo', canal: 'venta_cloro', origen: 'manual', cantidad: 1, importe_cents: 900000, movimientos: 1 },
    { chlorine_type: null, category: 'quimicos', product_name: 'Alguicida', canal: 'mostrador', origen: 'manual', cantidad: 2, importe_cents: 200000, movimientos: 1 },
    { chlorine_type: null, category: 'quimicos', product_name: 'Alguicida', canal: 'venta_cloro', origen: 'manual', cantidad: 1, importe_cents: 100000, movimientos: 1 },
  ];
  const r = armarReporte(filas);

  it('siempre los tres tipos, con cada canal y el total', () => {
    expect(r.cloro.map((f) => f.tipo)).toEqual(['liquido', 'granulado', 'pastilla']);
    const liq = r.cloro[0];
    expect(liq.canales.service).toEqual({ cantidad: 12.5, importe: 50000, online: 0 });
    expect(liq.canales.venta_service).toEqual({ cantidad: 15, importe: 120000, online: 5 });
    expect(liq.total).toEqual({ cantidad: 27.5, importe: 170000, online: 5 });
    expect(r.cloro[2].total).toEqual({ cantidad: 0, importe: 0, online: 0 });
  });

  it('importes por canal y del cloro', () => {
    expect(r.importePorCanal).toEqual({ service: 50000, venta_service: 120000, venta_cloro: 0, mostrador: 30000 });
    expect(r.importeCloro).toBe(200000);
  });

  it('otros productos por categoría y producto (sumando canales)', () => {
    expect(r.otros).toEqual([
      { categoria: 'quimicos', producto: 'Alguicida', cantidad: 3, importe: 300000 },
      { categoria: 'accesorios', producto: 'Barrefondo', cantidad: 1, importe: 900000 },
    ]);
    expect(r.importeOtros).toBe(1200000);
  });
});
