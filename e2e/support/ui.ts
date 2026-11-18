/**
 * Ayudas para manejar la interfaz real (shadcn/Radix) en los flujos e2e.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** Abre un <Select> de Radix (el disparador es un combobox) y elige la opción por su texto. */
export async function selectOption(page: Page, trigger: Locator, optionName: string | RegExp) {
  await trigger.click();
  await page.getByRole('option', { name: optionName }).first().click();
}

/** Los toasts (sonner) se anuncian en una región con rol status/alert. */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator('[data-sonner-toast]').filter({ hasText: text }).first();
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(toast(page, text)).toBeVisible({ timeout: 10_000 });
}

/** Etiqueta: el <Label> de shadcn no siempre está asociado con htmlFor; se busca el campo junto a su texto. */
export function fieldByLabel(page: Page, label: string | RegExp): Locator {
  return page.locator('div').filter({ has: page.getByText(label, { exact: false }) }).locator('input, textarea').first();
}

/** La ventana de confirmación de la app (components/ui/confirmar): toca el botón de la acción, o "Cancelar". */
export async function confirmar(page: Page, si = true) {
  const ventana = page.getByTestId('confirmar-ventana');
  await expect(ventana).toBeVisible();
  await ventana.getByTestId(si ? 'confirmar-si' : 'confirmar-no').click();
  await expect(ventana).toHaveCount(0);
}
