// Poses de Clorito (recortadas, fondo transparente). Cada una dice algo de la sección donde aparece.
const POSES = {
  relajado: { w: 693, h: 720, alt: "Clorito relajado en un flotador" },
  duda: { w: 508, h: 720, alt: "Clorito con una duda" },
  service: { w: 625, h: 720, alt: "Clorito limpiando la pileta con el barrefondo" },
  aprobacion: { w: 625, h: 720, alt: "Clorito con el pulgar arriba" },
  pensativo: { w: 514, h: 720, alt: "Clorito pensando" },
  celebrando: { w: 720, h: 715, alt: "Clorito celebrando" },
  repartidorcloro: { w: 531, h: 720, alt: "Clorito repartiendo pastillas de cloro" },
  camioneta: { w: 900, h: 607, alt: "Clorito manejando la camioneta de Pancho Piletas" },
  pileta: { w: 500, h: 474, alt: "Clorito flotando en la pileta" },
  consejos: { w: 552, h: 720, alt: "Clorito con una idea" },
  saludando: { w: 600, h: 720, alt: "Clorito saludando" },
} as const;

export type PoseClorito = keyof typeof POSES;

type Props = { pose: PoseClorito; alto: number; className?: string; decorativo?: boolean; eager?: boolean };

/** `alto` es el alto en px; el ancho sale de la proporción de cada pose. */
export function Clorito({ pose, alto, className, decorativo = true, eager = false }: Props) {
  const p = POSES[pose];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ilustración liviana (webp con transparencia)
    <img
      className={className}
      src={`/landing/v3/clorito/clorito-${pose}.webp`}
      alt={decorativo ? "" : p.alt}
      width={Math.round((p.w / p.h) * alto)}
      height={alto}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
