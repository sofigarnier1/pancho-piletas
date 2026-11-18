/**
 * Toques a WhatsApp de la landing: cualquiera registra (incluso sin sesión), solo el equipo lee,
 * nadie edita ni borra, y los largos están acotados.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { ACTORS, STAFF, as, rand, svc, type Actor } from '../support/clients';

const marca = rand('click');
afterAll(async () => { await svc().from('landing_clicks').delete().eq('boton', marca); });

describe('landing_clicks', () => {
  it.each(ACTORS)('%s puede registrar un toque', async (actor: Actor) => {
    const c = await as(actor);
    const { error } = await c.from('landing_clicks').insert({ boton: marca, seccion: 'hero', origen: 'instagram' });
    expect(error).toBeNull();
  });

  it.each(ACTORS)('%s lee los toques solo si es del equipo', async (actor: Actor) => {
    const c = await as(actor);
    const { data } = await c.from('landing_clicks').select('id').eq('boton', marca);
    expect((data ?? []).length > 0).toBe(STAFF.includes(actor));
  });

  it('no se aceptan textos vacíos ni larguísimos', async () => {
    const c = await as('anon');
    expect((await c.from('landing_clicks').insert({ boton: '', seccion: 'hero', origen: 'directo' })).error).not.toBeNull();
    expect((await c.from('landing_clicks').insert({ boton: 'x'.repeat(61), seccion: 'hero', origen: 'directo' })).error).not.toBeNull();
    expect((await c.from('landing_clicks').insert({ boton: marca, seccion: 'x'.repeat(31), origen: 'directo' })).error).not.toBeNull();
  });

  it.each(['admin', 'marketing', 'owner'] as Actor[])('%s no puede editar ni borrar', async (actor: Actor) => {
    const { data: fila } = await svc().from('landing_clicks').select('id').eq('boton', marca).limit(1).single();
    const c = await as(actor);
    await c.from('landing_clicks').update({ seccion: 'zz' }).eq('id', fila!.id);
    await c.from('landing_clicks').delete().eq('id', fila!.id);
    const { data: despues } = await svc().from('landing_clicks').select('seccion').eq('id', fila!.id).single();
    expect(despues?.seccion).toBe('hero');
  });
});
