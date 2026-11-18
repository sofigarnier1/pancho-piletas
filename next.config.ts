import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // No anunciar el framework en cada respuesta
  poweredByHeader: false,
  // Sin el botón "N" de Next.js flotando sobre la página en desarrollo
  devIndicators: false,
  // Para probar desde el celular en la misma red wifi (npm run dev)
  allowedDevOrigins: ["192.168.*.*", "10.0.*.*"],
  async headers() {
    return [{ source: "/(.*)", headers: [...securityHeaders] }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "PROJECT_REF.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
