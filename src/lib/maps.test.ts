import { describe, expect, it } from 'vitest';
import { comoLlegarUrl, lugar, rutaCompleta, PARADAS_POR_TRAMO } from './maps';

const conDir = (address: string) => ({ address, lat: null, lng: null });

describe('lugar', () => {
  it('usa las coordenadas si las tiene', () => {
    expect(lugar({ address: 'Libertador 1234', lat: -34.47, lng: -58.51 })).toBe('-34.47,-58.51');
  });
  it('si no, la dirección con barrio y localidad', () => {
    expect(lugar({ address: 'Libertador 1234', neighborhood: 'San Isidro', city: ' Buenos Aires ', lat: null, lng: null }))
      .toBe('Libertador 1234, San Isidro, Buenos Aires');
  });
  it('sin dirección ni coordenadas no hay lugar', () => {
    expect(lugar({ address: '  ', lat: null, lng: null })).toBeNull();
    expect(comoLlegarUrl({ address: null, lat: null, lng: null })).toBeNull();
  });
});

describe('comoLlegarUrl', () => {
  it('arma el enlace de Maps al destino, en auto', () => {
    expect(comoLlegarUrl(conDir('Av. Libertador 1234'))).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Av.%20Libertador%201234&travelmode=driving',
    );
  });
});

describe('rutaCompleta', () => {
  it('sin paradas no hay tramos', () => {
    expect(rutaCompleta([])).toEqual([]);
  });

  it('una sola parada: solo destino, sin intermedios', () => {
    const [t] = rutaCompleta([conDir('A 1')]);
    expect(t).toMatchObject({ desde: 1, hasta: 1, paradas: 1 });
    expect(t.url).not.toContain('waypoints');
  });

  it('respeta el orden: los intermedios en orden y la última como destino', () => {
    const [t] = rutaCompleta([conDir('A 1'), conDir('B 2'), conDir('C 3')]);
    expect(t.url).toContain('destination=C%203');
    expect(t.url).toContain('waypoints=A%201%7CB%202');
  });

  it('parte la ruta en tramos de 9 paradas', () => {
    const paradas = Array.from({ length: 20 }, (_, i) => conDir(`Calle ${i + 1}`));
    const tramos = rutaCompleta(paradas);
    expect(PARADAS_POR_TRAMO).toBe(9);
    expect(tramos.map((t) => [t.desde, t.hasta])).toEqual([[1, 9], [10, 18], [19, 20]]);
    expect(tramos[0].url).toContain('destination=Calle%209');
    expect(tramos[0].url.split('waypoints=')[1].split('%7C')).toHaveLength(8);
    expect(tramos[1].url).toContain('waypoints=Calle%2010%7C');
  });

  it('saltea las paradas sin dirección', () => {
    const tramos = rutaCompleta([conDir('A 1'), { address: null, lat: null, lng: null }, conDir('B 2')]);
    expect(tramos).toHaveLength(1);
    expect(tramos[0]).toMatchObject({ paradas: 2 });
  });
});
