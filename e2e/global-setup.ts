/**
 * Antes de cada corrida e2e: base local limpia + datos fijos (ver e2e/support/reset.ts).
 *   E2E_SKIP_RESET=1  → no resetea (útil al iterar un solo test; los datos pueden estar "sucios")
 */
import { resetAndSeed } from './support/reset';

export default async function globalSetup() {
  await resetAndSeed();
}
