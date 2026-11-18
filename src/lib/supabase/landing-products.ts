import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LandingProduct = {
  id: string;
  name: string;
  description: string | null;
  chlorine_type: "pastilla" | "granulado" | "liquido" | "combo" | "otro";
  price_cents: number;
  stock_units: number;
  in_stock: boolean;
  unit: "kg" | "litro" | "unidad";
  weight_kg: number | null;
  image_url: string | null;
  is_featured: boolean;
  promo_label: string | null;
};

export async function getLandingProducts(): Promise<LandingProduct[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, name, description, chlorine_type, price_cents, stock_units, in_stock, unit, weight_kg, image_url, is_featured, promo_label",
      )
      .eq("is_active", true)
      .order("display_order")
      .order("name");

    if (error) return [];
    return (data ?? []) as LandingProduct[];
  } catch {
    return [];
  }
}
