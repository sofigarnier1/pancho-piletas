import { describe, expect, it } from 'vitest';
import { clientWebEnabled, clientWebRedirect, conCuentaWeb, SIN_ACCESO_PARAM } from './client-web';

describe('clientWebEnabled', () => {
  it('solo con CLIENT_WEB_ACCESS=enabled', () => {
    expect(clientWebEnabled({ CLIENT_WEB_ACCESS: 'enabled' })).toBe(true);
    for (const v of [undefined, '', 'true', '1', 'ENABLED', 'disabled']) expect(clientWebEnabled({ CLIENT_WEB_ACCESS: v })).toBe(false);
  });
});

describe('clientWebRedirect con el acceso apagado', () => {
  it('el registro sigue abierto (solo se oculta su enlace): lo usa quien entra al equipo', () => {
    expect(clientWebRedirect('/register', undefined, false)).toBeNull();
  });

  it('un cliente que entra al portal se queda sin sesión y vuelve al login con el aviso', () => {
    for (const p of ['/client', '/client/dashboard', '/client/compras']) {
      expect(clientWebRedirect(p, 'client', false)).toEqual({ to: `/login?${SIN_ACCESO_PARAM}=1`, signOut: true });
    }
  });

  it('no toca al equipo, ni rutas parecidas, ni el login', () => {
    expect(clientWebRedirect('/client/dashboard', 'owner', false)).toBeNull(); // el proxy lo manda a su panel
    expect(clientWebRedirect('/client/dashboard', undefined, false)).toBeNull(); // sin sesión: el proxy lo manda al login
    expect(clientWebRedirect('/clientes', 'client', false)).toBeNull();
    expect(clientWebRedirect('/registered', undefined, false)).toBeNull();
    expect(clientWebRedirect('/login', 'client', false)).toBeNull();
    expect(clientWebRedirect('/admin/clientes', 'owner', false)).toBeNull();
  });
});

describe('clientWebRedirect con el acceso prendido', () => {
  it('no hace nada', () => {
    expect(clientWebRedirect('/register', undefined, true)).toBeNull();
    expect(clientWebRedirect('/client/dashboard', 'client', true)).toBeNull();
  });
});

describe('conCuentaWeb', () => {
  const items = [{ id: 'cloro' }, { id: 'cuenta', cuentaWeb: true }, { id: 'service', cuentaWeb: false }];
  it('apagado: saca lo de la cuenta web y conserva el orden', () => {
    expect(conCuentaWeb(items, false).map((i) => i.id)).toEqual(['cloro', 'service']);
  });
  it('prendido: deja todo', () => {
    expect(conCuentaWeb(items, true).map((i) => i.id)).toEqual(['cloro', 'cuenta', 'service']);
  });
});
