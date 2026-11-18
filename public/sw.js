// Service worker mínimo: solo hace que la app se pueda instalar. No guarda nada en caché
// (la app maneja sesiones y datos del día; cada pantalla se pide siempre al servidor).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
