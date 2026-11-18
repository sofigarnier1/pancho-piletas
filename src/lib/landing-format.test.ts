import { describe, expect, it } from 'vitest';
import { buildShippingLabel, buildTestimonials, cmsValue } from './landing-format';

describe('buildShippingLabel', () => {
  it('costo 0 → envío sin cargo', () => {
    expect(buildShippingLabel('0')).toBe('Envío gratis en Zona Norte');
  });

  it('convierte centavos a pesos', () => {
    expect(buildShippingLabel('150000')).toBe('Envío: $1.500');
    expect(buildShippingLabel('50000')).toBe('Envío: $500');
  });

  it('sin dato o dato inválido → no muestra etiqueta', () => {
    expect(buildShippingLabel(undefined)).toBeUndefined();
    expect(buildShippingLabel('abc')).toBeUndefined();
  });
});

describe('buildTestimonials', () => {
  const t = (i: number, extra: Record<string, string> = {}) => ({
    [`testimonios.t${i}_name`]: `Cliente ${i}`,
    [`testimonios.t${i}_text`]: `Texto ${i}`,
    ...extra,
  });

  it('arma los testimonios completos', () => {
    const out = buildTestimonials({ ...t(1, { 'testimonios.t1_zone': 'Tigre', 'testimonios.t1_rating': '5' }), ...t(2) });
    expect(out).toEqual([
      { name: 'Cliente 1', zone: 'Tigre', text: 'Texto 1', rating: 5 },
      { name: 'Cliente 2', zone: undefined, text: 'Texto 2', rating: undefined },
    ]);
  });

  it('descarta los que no tienen nombre o no tienen texto', () => {
    const out = buildTestimonials({
      'testimonios.t1_name': 'Solo nombre',
      'testimonios.t2_text': 'Solo texto',
      ...t(3),
    });
    expect(out.map((x) => x.name)).toEqual(['Cliente 3']);
  });

  it.each([['0'], ['6'], ['3.5'], ['abc'], ['']])('rating %j se ignora', (rating) => {
    const out = buildTestimonials({ ...t(1, { 'testimonios.t1_rating': rating }) });
    expect(out[0].rating).toBeUndefined();
  });

  it.each([['1', 1], ['3', 3], ['5', 5]])('rating %s es válido', (rating, expected) => {
    expect(buildTestimonials({ ...t(1, { 'testimonios.t1_rating': rating }) })[0].rating).toBe(expected);
  });

  it('sin contenido devuelve lista vacía', () => {
    expect(buildTestimonials({})).toEqual([]);
  });
});

describe('cmsValue', () => {
  const content = { 'hero.headline': 'Título del CMS', 'hero.cta_text': '', 'hero.subheadline': '   ' };

  it('usa el valor del CMS cuando existe', () => {
    expect(cmsValue(content, 'hero', 'headline', 'Por defecto')).toBe('Título del CMS');
  });

  it('usa el texto por defecto cuando la clave no existe', () => {
    expect(cmsValue(content, 'hero', 'otra', 'Por defecto')).toBe('Por defecto');
  });

  it('usa el texto por defecto cuando el campo se dejó vacío (no deja el título en blanco)', () => {
    expect(cmsValue(content, 'hero', 'cta_text', 'Por defecto')).toBe('Por defecto');
  });

  it('también cuando solo tiene espacios', () => {
    expect(cmsValue(content, 'hero', 'subheadline', 'Por defecto')).toBe('Por defecto');
  });

  it('respeta los espacios internos del texto', () => {
    expect(cmsValue({ 'a.b': ' dos  palabras ' }, 'a', 'b', 'x')).toBe(' dos  palabras ');
  });
});
