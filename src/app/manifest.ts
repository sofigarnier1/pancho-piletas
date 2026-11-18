import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pancho Piletas",
    short_name: "Pancho",
    description: "Itinerario y gestión del service de piletas.",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#F0F7FF",
    theme_color: "#1B5FA8",
    lang: "es-AR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
