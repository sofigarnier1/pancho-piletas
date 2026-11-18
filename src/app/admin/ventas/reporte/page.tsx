import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, Droplets, Store, Users, Wrench } from 'lucide-react';
import { PageHeader, Panel, PanelHeader, StatCard, Note } from '@/components/admin/bo';
import { requireRole, OWNER_ROLES } from '@/lib/auth/require-role';
import { todayInArgentina } from '@/lib/dates';
import { formatPesos } from '@/lib/precios';
import { armarReporte, moverMes, nombreMes, rangoMes, type FilaReporte } from '@/lib/cloro';
import { ReporteCloro, ReporteOtros } from './ReporteTablas';

export default async function ReporteCloroPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) redirect('/admin/dashboard');
  const { supabase } = auth;

  const { mes: mesParam } = await searchParams;
  const actual = todayInArgentina().slice(0, 7);
  const mes = rangoMes(mesParam) ? (mesParam as string) : actual;
  const { desde, hasta } = rangoMes(mes)!;

  const { data, error } = await supabase.rpc('reporte_cloro', { p_desde: desde, p_hasta: hasta });
  const r = armarReporte((data ?? []) as FilaReporte[]);

  return (
    <div className="bo-page">
      <PageHeader
        back={{ href: '/admin/ventas', label: 'Volver a ventas' }}
        eyebrow="Ventas"
        title="Cloro del mes"
        description="Cuánto cloro salió y para quién: aplicado en los services, vendido a clientes de service, a clientes que solo compran cloro y en el mostrador."
      />

      <div className="flex items-center justify-between gap-2" data-testid="reporte-mes">
        <Link href={`/admin/ventas/reporte?mes=${moverMes(mes, -1)}`} className="bo-btn" aria-label="Mes anterior">
          <ChevronLeft className="w-4 h-4" /> Mes anterior
        </Link>
        <strong className="text-sm capitalize">{nombreMes(mes)}</strong>
        {mes < actual ? (
          <Link href={`/admin/ventas/reporte?mes=${moverMes(mes, 1)}`} className="bo-btn" aria-label="Mes siguiente">
            Mes siguiente <ChevronRight className="w-4 h-4" />
          </Link>
        ) : <span />}
      </div>

      {error && <Note icon={Droplets} tone="red">{error.message}</Note>}

      <div className="bo-stats">
        <StatCard label="Aplicado en services" value={formatPesos(r.importePorCanal.service)} foot="A precio de cada cliente" icon={Wrench} tone="amber" />
        <StatCard label="Clientes de service" value={formatPesos(r.importePorCanal.venta_service)} foot="Cloro que les vendiste" icon={Users} tone="blue" />
        <StatCard label="Clientes solo de cloro" value={formatPesos(r.importePorCanal.venta_cloro)} foot="Sin pileta en el service" icon={Droplets} tone="green" />
        <StatCard label="Mostrador" value={formatPesos(r.importePorCanal.mostrador)} foot="Ventas sin cuenta" icon={Store} tone="purple" />
      </div>

      <Panel testId="reporte-cloro">
        <PanelHeader title="Cloro por tipo" sub="Líquido en litros, granulado en kilos y pastillas por unidad. Los pedidos online van dentro de su columna y se marcan aparte." bordered />
        <div className="p-4">
          <ReporteCloro filas={r.cloro} mes={mes} />
        </div>
      </Panel>

      <Panel testId="reporte-otros">
        <PanelHeader title="Otros productos" sub={`Químicos, accesorios, combos y demás · ${formatPesos(r.importeOtros)} en el mes`} bordered />
        <div className="p-4">
          <ReporteOtros filas={r.otros} mes={mes} />
        </div>
      </Panel>
    </div>
  );
}
