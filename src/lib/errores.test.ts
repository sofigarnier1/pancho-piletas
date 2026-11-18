import { describe, expect, it } from 'vitest';
import { WHATSAPP_ERRORES, filaDeReporte, generarCodigo, mensajeWhatsApp, recortar, rutaSinParametros, urlWhatsApp } from './errores';

describe('reporte de errores', () => {
  it('el código tiene 6 caracteres legibles y cumple el formato de la base', () => {
    for (let i = 0; i < 200; i++) {
      const c = generarCodigo();
      expect(c).toMatch(/^[A-Z2-9]{6}$/);
      expect(c).not.toMatch(/[01OI]/);
    }
  });

  it('el WhatsApp va al número pedido, con país y 9 de celular', () => {
    expect(WHATSAPP_ERRORES).toBe('5493442563953');
    expect(urlWhatsApp('ABC234', '/admin/cobros')).toMatch(/^https:\/\/wa\.me\/5493442563953\?text=/);
  });

  it('el mensaje incluye el código y la pantalla, sin parámetros de la URL', () => {
    const m = mensajeWhatsApp('ABC234', '/reset-password?token=secreto#x');
    expect(m).toContain('Código: ABC234');
    expect(m).toContain('Pantalla: /reset-password');
    expect(m).not.toContain('secreto');
  });

  it('rutaSinParametros saca consulta y ancla', () => {
    expect(rutaSinParametros('/a/b?x=1#y')).toBe('/a/b');
    expect(rutaSinParametros('https://sitio.com/c?t=1')).toBe('/c');
  });

  it('recortar respeta el largo y tolera vacíos', () => {
    expect(recortar('abcdef', 3)).toBe('abc');
    expect(recortar('', 3)).toBeNull();
    expect(recortar(null, 3)).toBeNull();
  });

  it('la fila respeta los largos que exige la base', () => {
    const fila = filaDeReporte({
      codigo: 'ABC234',
      origen: 'pantalla',
      mensaje: 'x'.repeat(5000),
      detalle: 'y'.repeat(20000),
      ruta: '/p?token=1',
      digest: 'd'.repeat(500),
      navegador: 'n'.repeat(900),
    });
    expect(fila.message).toHaveLength(1000);
    expect(fila.details).toHaveLength(6000);
    expect(fila.path).toBe('/p');
    expect(fila.digest).toHaveLength(100);
    expect(fila.user_agent).toHaveLength(300);
  });

  it('un mensaje vacío igual se puede guardar', () => {
    expect(filaDeReporte({ codigo: 'ABC234', origen: 'promesa', mensaje: '' }).message).toBe('Error sin mensaje');
  });
});
