import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";
import { getLandingContent } from "@/lib/supabase/landing";
import { getLandingProducts } from "@/lib/supabase/landing-products";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Pancho Piletas · Cloro y service de piletas en Zona Norte",
  description:
    "Cloro para piletas con entrega coordinada y service de mantenimiento en Zona Norte, Buenos Aires. Pedí tu cloro o tu service por WhatsApp.",
};

export default async function Home() {
  const [content, products] = await Promise.all([getLandingContent(), getLandingProducts()]);
  return <Landing content={content} products={products} />;
}
