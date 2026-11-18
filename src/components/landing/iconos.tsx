// Íconos de la landing (los mismos de la demo V3).

export function WaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.04 2C6.5 2 2.04 6.46 2.04 12c0 1.77.46 3.5 1.34 5.02L2 22l5.1-1.34A9.96 9.96 0 0 0 12.04 22C17.58 22 22 17.54 22 12S17.58 2 12.04 2Zm5.8 14.13c-.24.68-1.42 1.32-1.95 1.36-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.1-1.47-1.1-2.8 0-1.34.7-2 .95-2.27.25-.27.54-.34.72-.34h.52c.17 0 .4-.06.62.47.24.56.8 1.94.87 2.08.07.14.11.3.02.48-.1.18-.14.3-.27.46l-.41.48c-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.9 1.05.93 1.93 1.22 2.2 1.36.28.14.44.11.6-.07.16-.18.69-.8.88-1.08.18-.27.36-.23.61-.14.25.09 1.6.75 1.87.89.27.14.46.2.52.32.07.11.07.66-.17 1.33Z"
      />
    </svg>
  );
}

/** Marca: letras "Pancho Piletas" */
export function Marca() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- letras del logo, fijas */}
      <img className="brand-letras" src="/landing/v3/logo-letras.webp" alt="Pancho Piletas" width={96} height={46} />
    </>
  );
}

/** Año desde el que Pancho cuida piletas. */
export const ANIO_INICIO = 1989;

/** Sello "Desde 1989": rosetón amarillo con gota y ola, letras navy en la tipografía de la marca. */
export function Sello({ anio }: { anio: number }) {
  const puntas = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    return <circle key={i} cx={(100 + 88 * Math.cos(a)).toFixed(2)} cy={(100 + 88 * Math.sin(a)).toFixed(2)} r="11" fill="#ffc94a" />;
  });
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={`Desde ${anio}`} className="sello-svg">
      <defs>
        <clipPath id="sello-recorte">
          <circle cx="100" cy="100" r="99" />
        </clipPath>
        <linearGradient id="sello-luz" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sello-sol" cx=".3" cy=".25" r=".7">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {puntas}
      <circle cx="100" cy="100" r="90" fill="#ffc94a" />
      <circle cx="100" cy="100" r="76" fill="none" stroke="#0a3d5c" strokeWidth="2.5" />
      <circle cx="100" cy="100" r="69" fill="none" stroke="#0a3d5c" strokeWidth="1.2" strokeDasharray="2 5" strokeLinecap="round" />
      <text x="100" y="82" textAnchor="middle" className="sello-desde">DESDE</text>
      <text x="100" y="128" textAnchor="middle" className="sello-anio">{anio}</text>
      {/* brillo: como si le diera el sol (reflejo fijo + destello que cruza cada tanto) */}
      <g clipPath="url(#sello-recorte)" pointerEvents="none">
        <circle cx="100" cy="100" r="100" fill="url(#sello-sol)" />
        <rect className="sello-destello" x="-70" y="-20" width="46" height="240" fill="url(#sello-luz)" transform="skewX(-18)" />
      </g>
    </svg>
  );
}

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
