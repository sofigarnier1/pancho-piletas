import { describe, expect, it, vi } from 'vitest';
import { buscarDireccion, distanciaKm, parseCoordenadas, textoParaBuscar } from './ubicacion';

describe('parseCoordenadas', () => {
  it.each([
    ['-34.4708, -58.5286', { lat: -34.4708, lng: -58.5286 }],
    ['-34.4708 -58.5286', { lat: -34.4708, lng: -58.5286 }],
    ['https://www.google.com/maps/place/Los+Ceibos/@-34.4708,-58.5286,17z/data=x', { lat: -34.4708, lng: -58.5286 }],
    ['https://maps.google.com/?q=-34.47,-58.52', { lat: -34.47, lng: -58.52 }],
    ['https://www.google.com/maps/place/x/data=!3d-34.4712!4d-58.5291', { lat: -34.4712, lng: -58.5291 }],
  ])('%s', (t, c) => expect(parseCoordenadas(t)).toEqual(c));

  it.each([[''], ['Los Ceibos 120'], ['-134, 20'], ['10, 200'], [null]])('%j no son coordenadas', (t) =>
    expect(parseCoordenadas(t as string)).toBeNull());
});

describe('distanciaKm', () => {
  it('San Isidro → Tigre ronda los 13 km; un punto consigo mismo, 0', () => {
    const si = { lat: -34.4708, lng: -58.5286 };
    expect(distanciaKm(si, { lat: -34.4260, lng: -58.5796 })).toBeGreaterThan(5);
    expect(distanciaKm(si, { lat: -34.4260, lng: -58.5796 })).toBeLessThan(15);
    expect(distanciaKm(si, si)).toBe(0);
  });
});

describe('textoParaBuscar', () => {
  it('dirección, barrio, ciudad (por defecto Buenos Aires) y país; sin dirección, nada', () => {
    expect(textoParaBuscar({ address: 'Los Ceibos 120', neighborhood: 'San Isidro', city: null })).toBe('Los Ceibos 120, San Isidro, Buenos Aires, Argentina');
    expect(textoParaBuscar({ address: '  ', neighborhood: 'San Isidro', city: null })).toBeNull();
  });
});

describe('buscarDireccion', () => {
  it('devuelve el primer resultado y solo manda la dirección', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([{ lat: '-34.47', lon: '-58.52' }]), { status: 200 }));
    expect(await buscarDireccion('Los Ceibos 120, San Isidro', f as unknown as typeof fetch)).toEqual({ lat: -34.47, lng: -58.52 });
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('nominatim.openstreetmap.org');
    expect(url).toContain('countrycodes=ar');
  });
  it('sin resultados, con error o si el servicio falla: null', async () => {
    expect(await buscarDireccion('x', (async () => new Response('[]')) as unknown as typeof fetch)).toBeNull();
    expect(await buscarDireccion('x', (async () => new Response('', { status: 429 })) as unknown as typeof fetch)).toBeNull();
    expect(await buscarDireccion('x', (async () => { throw new Error('red'); }) as unknown as typeof fetch)).toBeNull();
  });
});
