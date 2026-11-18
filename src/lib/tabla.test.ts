import { describe, expect, it } from 'vitest';
import { buscar, comparar, filasExcel, nombreArchivo, ordenar, siguienteOrden, totales, type Columna } from './tabla';

type Fila = { nombre: string; numero: number | null; barrio: string | null; cloro: number | null };
const filas: Fila[] = [
  { nombre: 'Marta Gómez', numero: 101, barrio: 'San Isidro', cloro: 5 },
  { nombre: 'Ángel Díaz', numero: null, barrio: 'Tigre', cloro: 2.5 },
  { nombre: 'Jorge Pereyra', numero: 12, barrio: null, cloro: null },
];
const columnas: Columna<Fila>[] = [
  { id: 'nombre', titulo: 'Cliente', valor: (f) => f.nombre, buscable: true },
  { id: 'numero', titulo: 'N°', valor: (f) => f.numero, numerica: true, buscable: true },
  { id: 'barrio', titulo: 'Barrio', valor: (f) => f.barrio, buscable: true },
  { id: 'cloro', titulo: 'Cloro', valor: (f) => f.cloro, numerica: true, total: true },
];

describe('comparar', () => {
  it('números como números y textos sin importar acentos ni mayúsculas', () => {
    expect(comparar(2, 10)).toBeLessThan(0);
    expect(comparar('angel', 'Ángel')).toBe(0);
    expect(comparar('Barrio 2', 'Barrio 10')).toBeLessThan(0);
  });
  it('los vacíos van al final', () => {
    expect(comparar(null, 'a')).toBeGreaterThan(0);
    expect(comparar('', 1)).toBeGreaterThan(0);
    expect(comparar(null, null)).toBe(0);
  });
});

describe('ordenar', () => {
  it('ascendente y descendente, con los vacíos siempre al final', () => {
    expect(ordenar(filas, columnas, { columna: 'numero', sentido: 'asc' }).map((f) => f.numero)).toEqual([12, 101, null]);
    expect(ordenar(filas, columnas, { columna: 'numero', sentido: 'desc' }).map((f) => f.numero)).toEqual([101, 12, null]);
    expect(ordenar(filas, columnas, { columna: 'barrio', sentido: 'desc' }).map((f) => f.barrio)).toEqual(['Tigre', 'San Isidro', null]);
  });
  it('sin orden o con una columna que no existe, deja la lista como estaba (y no la modifica)', () => {
    expect(ordenar(filas, columnas, null)).toEqual(filas);
    expect(ordenar(filas, columnas, { columna: 'nada', sentido: 'asc' })).toEqual(filas);
    const antes = [...filas];
    ordenar(filas, columnas, { columna: 'nombre', sentido: 'asc' });
    expect(filas).toEqual(antes);
  });
});

describe('siguienteOrden', () => {
  it('ascendente → descendente → sin orden, y otra columna arranca en ascendente', () => {
    expect(siguienteOrden(null, 'a')).toEqual({ columna: 'a', sentido: 'asc' });
    expect(siguienteOrden({ columna: 'a', sentido: 'asc' }, 'a')).toEqual({ columna: 'a', sentido: 'desc' });
    expect(siguienteOrden({ columna: 'a', sentido: 'desc' }, 'a')).toBeNull();
    expect(siguienteOrden({ columna: 'a', sentido: 'desc' }, 'b')).toEqual({ columna: 'b', sentido: 'asc' });
  });
});

describe('buscar', () => {
  it('busca en las columnas buscables, sin acentos, y exige todas las palabras', () => {
    expect(buscar(filas, columnas, 'angel').map((f) => f.nombre)).toEqual(['Ángel Díaz']);
    expect(buscar(filas, columnas, 'isidro marta')).toHaveLength(1);
    expect(buscar(filas, columnas, 'isidro jorge')).toHaveLength(0);
    expect(buscar(filas, columnas, '101')).toHaveLength(1);
  });
  it('vacío devuelve todo; no busca en columnas que no son buscables', () => {
    expect(buscar(filas, columnas, '  ')).toHaveLength(3);
    expect(buscar(filas, columnas, '2.5')).toHaveLength(0);
  });
});

describe('totales y Excel', () => {
  it('suma solo las columnas con total, ignorando vacíos', () => {
    expect(totales(filas, columnas)).toEqual({ cloro: 7.5 });
  });
  it('arma encabezado en negrita, las filas y la fila Total', () => {
    const x = filasExcel(filas, columnas);
    expect(x[0]).toEqual(columnas.map((c) => ({ value: c.titulo, fontWeight: 'bold' })));
    expect(x[1]).toEqual([{ value: 'Marta Gómez' }, { value: 101 }, { value: 'San Isidro' }, { value: 5 }]);
    expect(x[3]).toEqual([{ value: 'Jorge Pereyra' }, { value: 12 }, null, null]);
    expect(x[4]).toEqual([{ value: 'Total', fontWeight: 'bold' }, null, null, { value: 7.5, fontWeight: 'bold' }]);
  });
  it('sin columnas que sumen, no agrega la fila Total', () => {
    expect(filasExcel(filas, columnas.slice(0, 3))).toHaveLength(4);
  });
  it('nombre de archivo sin acentos ni espacios', () => {
    expect(nombreArchivo('Clientes y piletas — Noviembre 2026')).toBe('clientes-y-piletas-noviembre-2026.xlsx');
    expect(nombreArchivo('***')).toBe('planilla.xlsx');
  });
});
