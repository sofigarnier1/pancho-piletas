import Link from 'next/link';

/** Pestañas de Services: la planilla de services, la de desagotes y la planilla semanal (como la de papel). */
export function ServicesTabs({ actual, mes }: { actual: 'services' | 'desagotes' | 'planilla'; mes: string }) {
  const tabs = [
    { id: 'services', label: 'Services', href: `/admin/services?mes=${mes}` },
    { id: 'desagotes', label: 'Desagotes', href: `/admin/services?mes=${mes}&tipo=desagote` },
    { id: 'planilla', label: 'Planilla semanal', href: `/admin/services/planilla?mes=${mes}` },
  ] as const;
  return (
    <nav className="bo-segmented mb-4 no-print" aria-label="Vistas de services">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} data-active={actual === t.id} aria-current={actual === t.id ? 'page' : undefined} data-testid={`services-pestana-${t.id}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
