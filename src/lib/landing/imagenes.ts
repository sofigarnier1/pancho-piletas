// Las fotos que carga el equipo (productos, caso real) solo se muestran si son propias del sitio
// o están en el almacenamiento público del proyecto; cualquier otra URL se ignora.
const STORAGE = "https://PROJECT_REF.supabase.co/storage/v1/object/public/";

export const esImagenDelProyecto = (url?: string | null): url is string =>
  Boolean(url && ((url.startsWith("/") && !url.startsWith("//")) || url.startsWith(STORAGE)));
