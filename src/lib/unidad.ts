/** "5 unidad" → "5 unidades": solo "unidad" cambia; kg y demás quedan igual */
export function unidadConCantidad(cantidad: number, unidad: string): string {
  return `${cantidad} ${unidad === 'unidad' && cantidad !== 1 ? 'unidades' : unidad}`
}
