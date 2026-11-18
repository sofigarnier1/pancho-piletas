import type { SupabaseClient } from '@supabase/supabase-js';
import { embedOne } from '@/lib/clients';
import type { PriceRow } from '@/lib/precios';

/** Un cliente de una pileta (titular o co-cliente). */
export type ClienteDePileta = { id: string; full_name: string; client_number: number | null; is_primary: boolean };
export type OpcionCliente = { id: string; full_name: string; client_number: number | null };

/**
 * Una fila de "Clientes y piletas": una por pileta, como la planilla de papel. Los clientes que todavía no tienen
 * pileta aparecen igual, con `poolId` en null.
 */
export type FilaClientePileta = {
  key: string;
  poolId: string | null;
  clientId: string;
  numero: number | null;
  cliente: string;
  coClientes: string[];
  clientesPileta: ClienteDePileta[];
  telefono: string | null;
  estadoCliente: string;
  notasCliente: string | null;
  direccion: string | null;
  barrio: string | null;
  alias: string | null;
  tipo: string | null;
  notasPileta: string | null;
  piletaActiva: boolean | null;
  ultimaVisita: string | null;
  /** Precios del titular (todos los tipos y fechas); solo los ve el dueño (RLS de client_prices). */
  precios: PriceRow[];
};

type ProfileRow = { id: string; full_name: string; phone: string | null; status: string; client_profiles: unknown };

export async function getClientesYPiletas(supabase: SupabaseClient): Promise<{ filas: FilaClientePileta[]; opciones: OpcionCliente[] }> {
  const desde = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: pools, error: e1 }, { data: clients, error: e2 }, { data: links, error: e3 }, { data: logs, error: e4 }, { data: prices, error: e5 }] = await Promise.all([
    supabase
      .from('pools')
      .select('id, client_id, nickname, address, neighborhood, pool_type, notes, is_active')
      .order('created_at'),
    supabase
      .from('profiles')
      .select('id, full_name, phone, status, client_profiles (client_number, notes)')
      .eq('role', 'client')
      .order('full_name'),
    supabase.from('pool_clients').select('pool_id, client_id, is_primary'),
    supabase.from('service_logs').select('pool_id, date').gte('date', desde).order('date', { ascending: false }).limit(20000),
    supabase.from('client_prices').select('id, client_id, kind, price_cents, valid_from').limit(20000),
  ]);
  const error = e1 ?? e2 ?? e3 ?? e4 ?? e5;
  if (error) throw error;

  const perfil = new Map<string, ProfileRow & { numero: number | null; notas: string | null }>();
  for (const c of (clients ?? []) as ProfileRow[]) {
    const cp = embedOne(c.client_profiles as { client_number: number | null; notes: string | null } | null);
    perfil.set(c.id, { ...c, numero: cp?.client_number ?? null, notas: cp?.notes ?? null });
  }

  const preciosDe = new Map<string, PriceRow[]>();
  for (const p of prices ?? []) {
    const lista = preciosDe.get(p.client_id as string) ?? [];
    lista.push({ id: p.id as string, kind: p.kind as string, price_cents: Number(p.price_cents), valid_from: p.valid_from as string });
    preciosDe.set(p.client_id as string, lista);
  }

  const ultima = new Map<string, string>();
  for (const l of logs ?? []) {
    const id = l.pool_id as string;
    if (!ultima.has(id)) ultima.set(id, l.date as string);
  }

  const porPileta = new Map<string, { client_id: string; is_primary: boolean }[]>();
  const conPileta = new Set<string>();
  for (const l of links ?? []) {
    const lista = porPileta.get(l.pool_id as string) ?? [];
    lista.push({ client_id: l.client_id as string, is_primary: l.is_primary as boolean });
    porPileta.set(l.pool_id as string, lista);
    conPileta.add(l.client_id as string);
  }

  const filas: FilaClientePileta[] = [];
  for (const p of pools ?? []) {
    const titular = perfil.get(p.client_id as string);
    if (!titular) continue; // pileta de alguien que no es cliente (no debería pasar)
    const clientesPileta: ClienteDePileta[] = (porPileta.get(p.id as string) ?? [])
      .flatMap((l) => {
        const c = perfil.get(l.client_id);
        return c ? [{ id: c.id, full_name: c.full_name, client_number: c.numero, is_primary: l.client_id === titular.id }] : [];
      })
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.full_name.localeCompare(b.full_name, 'es'));
    if (!clientesPileta.some((c) => c.is_primary)) {
      clientesPileta.unshift({ id: titular.id, full_name: titular.full_name, client_number: titular.numero, is_primary: true });
    }
    filas.push({
      key: `p-${p.id}`,
      poolId: p.id as string,
      clientId: titular.id,
      numero: titular.numero,
      cliente: titular.full_name,
      coClientes: clientesPileta.filter((c) => !c.is_primary).map((c) => c.full_name),
      clientesPileta,
      telefono: titular.phone,
      estadoCliente: titular.status,
      notasCliente: titular.notas,
      direccion: (p.address as string | null) ?? null,
      barrio: (p.neighborhood as string | null) ?? null,
      alias: (p.nickname as string | null) ?? null,
      tipo: (p.pool_type as string | null) ?? null,
      notasPileta: (p.notes as string | null) ?? null,
      piletaActiva: p.is_active as boolean,
      ultimaVisita: ultima.get(p.id as string) ?? null,
      precios: preciosDe.get(titular.id) ?? [],
    });
  }

  for (const c of perfil.values()) {
    if (conPileta.has(c.id)) continue;
    filas.push({
      key: `c-${c.id}`, poolId: null, clientId: c.id, numero: c.numero, cliente: c.full_name, coClientes: [], clientesPileta: [],
      telefono: c.phone, estadoCliente: c.status, notasCliente: c.notas, direccion: null, barrio: null, alias: null, tipo: null,
      notasPileta: null, piletaActiva: null, ultimaVisita: null, precios: preciosDe.get(c.id) ?? [],
    });
  }

  // Orden de la planilla: por N° de cliente; los que no tienen N°, al final por nombre
  filas.sort((a, b) =>
    (a.numero ?? Number.MAX_SAFE_INTEGER) - (b.numero ?? Number.MAX_SAFE_INTEGER) || a.cliente.localeCompare(b.cliente, 'es'));

  const opciones: OpcionCliente[] = [...perfil.values()]
    .filter((c) => c.status === 'active')
    .map((c) => ({ id: c.id, full_name: c.full_name, client_number: c.numero }));
  return { filas, opciones };
}

