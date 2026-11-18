import AguaCursor from "./AguaCursor";
import "./landing.css";
import "./landing-extra.css";
import LandingAnalytics from "@/components/LandingAnalytics";
import { cms } from "@/lib/supabase/landing";
import type { LandingProduct } from "@/lib/supabase/landing-products";
import { buildCondiciones, buildTestimonials } from "@/lib/landing-format";
import { esImagenDelProyecto } from "@/lib/landing/imagenes";
import { safeHttpUrl } from "@/lib/safe-url";
import AyudaClorito from "./AyudaClorito";
import { ConsultaProvider } from "./consulta";
import { CarritoProvider } from "./Carrito";
import LandingNav from "./LandingNav";
import Hero from "./Hero";
import RevealScroll from "./RevealScroll";
import CintaMensajes from "./CintaMensajes";
import Catalogo from "./Catalogo";
import Service from "./Service";
import Limpieza from "./Limpieza";
import ConsejosPancho from "./ConsejosPancho";
import { Cierre, LandingFooter, Nosotros, Preguntas, Testimonios } from "./secciones";

import { POR_DEFECTO } from "@/lib/landing/por-defecto";

export { POR_DEFECTO };

type Props = { content: Record<string, string>; products: LandingProduct[] };

export default function Landing({ content, products }: Props) {
  const t = <S extends keyof typeof POR_DEFECTO>(section: S, key: keyof (typeof POR_DEFECTO)[S] & string) =>
    cms(content, section, key, POR_DEFECTO[section][key] as string);
  const opcional = (k: string) => content[k]?.trim() || undefined;

  const condiciones = buildCondiciones(content);
  const casoImagen = content["resultado.image_url"]?.trim();

  return (
    <div className="lv3 fondo-claro">
      <a className="skip-link" href="#cloro">
        Ir al contenido
      </a>
      <LandingAnalytics />
      <ConsultaProvider>
        <CarritoProvider>
        <div className="underwater-world" aria-hidden="true">
          <div className="water-rays"></div>
          <div className="water-caustics"></div>
        </div>
        <AguaCursor />
        <CintaMensajes aviso={content["aviso.activo"] === "1" ? opcional("aviso.texto") ?? undefined : undefined} />
        <LandingNav />
        <main id="top">
          <Hero headline={t("hero", "headline")} subheadline={t("hero", "subheadline")} ctaText={t("hero", "cta_text")} />
          <Catalogo products={products} />
          <Service titulo={t("service", "titulo")} bajada={t("service", "bajada")} exclusiones={t("service", "exclusiones")} />
          <Nosotros
            titulo={t("nosotros", "titulo")}
            cuerpo={t("nosotros", "cuerpo")}
            cobertura={t("footer", "coverage_text")}
            anios={opcional("nosotros.stat_years") ?? "37"}
            clientes={opcional("nosotros.stat_clients") ?? "100"}
          >
            <Testimonios testimonios={buildTestimonials(content)} resenasUrl={safeHttpUrl(content["testimonios.reviews_url"])} />
          </Nosotros>
          <Limpieza
            casoImagen={esImagenDelProyecto(casoImagen) ? casoImagen : undefined}
            casoPie={opcional("resultado.caption")}
            casoResumen={opcional("resultado.case_summary")}
          />
          <ConsejosPancho />
          <Preguntas mediosDePago={opcional("config.payment_methods")} />
          <Cierre condiciones={condiciones} />
        </main>
        <RevealScroll />
        <AyudaClorito />
        <LandingFooter
          phone={t("footer", "phone")}
          instagram={t("footer", "instagram")}
          coverageText={t("footer", "coverage_text")}
          responsibleName={opcional("footer.responsible_name")}
          termsUrl={safeHttpUrl(content["footer.terms_url"])}
          privacyUrl={safeHttpUrl(content["footer.privacy_url"])}
        />
        </CarritoProvider>
      </ConsultaProvider>
    </div>
  );
}
