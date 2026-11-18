'use client';

import { Info } from 'lucide-react';
import { LandingVista } from '@/components/admin/LandingVista';
import Hero from '@/components/landing/Hero';
import Service from '@/components/landing/Service';
import Limpieza from '@/components/landing/Limpieza';
import { Cierre, LandingFooter, Nosotros, Testimonios } from '@/components/landing/secciones';
import { POR_DEFECTO } from '@/lib/landing/por-defecto';
import { buildCondiciones, buildTestimonials, cmsValue } from '@/lib/landing-format';
import { esImagenDelProyecto } from '@/lib/landing/imagenes';
import { safeHttpUrl } from '@/lib/safe-url';

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <p>{children}</p>
    </div>
  );
}

/** La sección real de la landing con lo que se está escribiendo, tal como quedaría al guardar. */
export function CmsVista({ sectionId, values }: { sectionId: string; values: Record<string, string> }) {
  const content: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) content[`${sectionId}.${key}`] = value;

  const t = <S extends keyof typeof POR_DEFECTO>(section: S, key: keyof (typeof POR_DEFECTO)[S] & string) =>
    cmsValue(content, section, key, POR_DEFECTO[section][key] as string);
  const opcional = (k: string) => content[k]?.trim() || undefined;

  let seccion: React.ReactNode = null;
  if (sectionId === 'hero') {
    seccion = <Hero headline={t('hero', 'headline')} subheadline={t('hero', 'subheadline')} ctaText={t('hero', 'cta_text')} />;
  } else if (sectionId === 'service') {
    seccion = <Service titulo={t('service', 'titulo')} bajada={t('service', 'bajada')} exclusiones={t('service', 'exclusiones')} />;
  } else if (sectionId === 'nosotros') {
    seccion = (
      <Nosotros
        titulo={t('nosotros', 'titulo')}
        cuerpo={t('nosotros', 'cuerpo')}
        cobertura={POR_DEFECTO.footer.coverage_text}
        anios={opcional('nosotros.stat_years')}
        clientes={opcional('nosotros.stat_clients')}
      />
    );
  } else if (sectionId === 'testimonios') {
    const testimonios = buildTestimonials(content);
    if (testimonios.length === 0) {
      return (
        <Aviso>
          Los testimonios no aparecen en la landing hasta que haya al menos uno visible, con nombre, texto y la autorización del cliente marcada.
        </Aviso>
      );
    }
    seccion = <Testimonios testimonios={testimonios} resenasUrl={safeHttpUrl(content['testimonios.reviews_url'])} />;
  } else if (sectionId === 'resultado') {
    const imagen = opcional('resultado.image_url');
    seccion = (
      <Limpieza
        casoImagen={esImagenDelProyecto(imagen) ? imagen : undefined}
        casoPie={opcional('resultado.caption')}
        casoResumen={opcional('resultado.case_summary')}
      />
    );
  } else if (sectionId === 'footer') {
    seccion = (
      <LandingFooter
        phone={t('footer', 'phone')}
        instagram={t('footer', 'instagram')}
        coverageText={t('footer', 'coverage_text')}
        responsibleName={opcional('footer.responsible_name')}
        termsUrl={safeHttpUrl(content['footer.terms_url'])}
        privacyUrl={safeHttpUrl(content['footer.privacy_url'])}
      />
    );
  } else if (sectionId === 'aviso') {
    seccion = values.texto?.trim() ? (
      <div className="lv3-aviso" style={{ position: 'static' }}>
        <p>{values.texto.trim()}</p>
      </div>
    ) : null;
  } else if (sectionId === 'config') {
    seccion = <Cierre condiciones={buildCondiciones(content)} />;
  }

  if (!seccion) return null;
  return <LandingVista>{seccion}</LandingVista>;
}
