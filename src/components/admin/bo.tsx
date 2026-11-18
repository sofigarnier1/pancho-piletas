// Piezas de presentación del backoffice (estilo en src/app/admin/backoffice.css).
// Solo dan forma: no buscan datos ni llaman acciones. Los textos llegan siempre desde la pantalla
// para que los tests del manual sigan encontrándolos en el archivo de cada tema.
import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

type Icon = ComponentType<{ className?: string }>;
export type Tone = 'blue' | 'green' | 'amber' | 'purple';
export type BadgeTone = Tone | 'red' | 'gray';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: ReactNode };
}) {
  return (
    <>
      {back && (
        <Link href={back.href} className="bo-back">
          <ArrowLeft className="w-4 h-4" />
          {back.label}
        </Link>
      )}
      <div className="bo-page-header">
        <div>
          {eyebrow && <span className="bo-eyebrow">{eyebrow}</span>}
          <h1 className="bo-title">{title}</h1>
          {description && <div className="bo-subtitle">{description}</div>}
        </div>
        {actions && <div className="bo-actions">{actions}</div>}
      </div>
    </>
  );
}

export function Panel({ className, children, as: As = 'section', testId }: { className?: string; children: ReactNode; as?: 'section' | 'div'; testId?: string }) {
  return <As className={cn('bo-panel', className)} data-testid={testId}>{children}</As>;
}

export function PanelHeader({
  title,
  sub,
  action,
  icon: IconCmp,
  bordered,
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  icon?: Icon;
  bordered?: boolean;
}) {
  return (
    <div className={cn('bo-panel-header', bordered && 'bordered')}>
      <div className="flex items-center gap-3 min-w-0">
        {IconCmp && (
          <span className="bo-icon-tile">
            <IconCmp />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="bo-panel-title">{title}</h2>
          {sub && <p className="bo-panel-sub">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  foot,
  icon: IconCmp,
  tone = 'blue',
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode;
  icon: Icon;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <div className="bo-stat-top">
        <span className="truncate">{label}</span>
        <IconCmp />
      </div>
      <strong className="bo-stat-value">{value}</strong>
      {foot && <div className="bo-stat-foot">{foot}</div>}
    </>
  );
  return href ? (
    <Link href={href} className={cn('bo-stat', `tone-${tone}`)}>
      {body}
    </Link>
  ) : (
    <article className={cn('bo-stat', `tone-${tone}`)}>{body}</article>
  );
}

export function StatusBadge({ tone = 'blue', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={cn('bo-badge', tone, className)}>{children}</span>;
}

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?';
  return (
    <span className={cn('bo-avatar', small && 'sm')} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Note({ icon: IconCmp, tone, children, className }: { icon: Icon; tone?: 'amber' | 'red'; children: ReactNode; className?: string }) {
  return (
    <div className={cn('bo-note', tone, className)}>
      <IconCmp />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({ icon: IconCmp, children }: { icon: Icon; children: ReactNode }) {
  return (
    <div className="bo-empty">
      <IconCmp />
      {children}
    </div>
  );
}
