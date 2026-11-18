import { resetAndSeed } from '../../e2e/support/reset';

// Una sola vez antes de todos los tests de base de datos y de acciones.
export default async function setup() {
  await resetAndSeed();
}
