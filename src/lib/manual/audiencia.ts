import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { mapSupabaseUserToAppUser, type UserRole } from "@/lib/supabase/user"

/** Con qué rol mira el manual quien está en la página (el proxy ya dejó afuera a quien no corresponde a la zona) */
export async function rolActual(): Promise<UserRole> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  return mapSupabaseUserToAppUser(user).role
}
