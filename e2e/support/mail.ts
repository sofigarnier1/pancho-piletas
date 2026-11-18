/**
 * Lectura de los mails que genera Supabase local (Mailpit, puerto 54324). No sale ningún mail real.
 */
type Address = { Address: string };
type Summary = { ID: string; Subject: string; To: Address[]; Created: string };

const base = () => {
  const url = process.env.E2E_MAIL_URL;
  if (!url) throw new Error('Falta E2E_MAIL_URL (se define en e2e/support/env.ts)');
  return url;
};

export async function clearMailbox(): Promise<void> {
  await fetch(`${base()}/api/v1/messages`, { method: 'DELETE' });
}

/** Espera el mail (más reciente) enviado a `to`. */
export async function waitForEmail(to: string, { timeoutMs = 20_000 } = {}): Promise<{ subject: string; text: string; html: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${base()}/api/v1/messages`);
    const { messages = [] } = (await res.json()) as { messages?: Summary[] };
    const mine = messages.filter((m) => m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()));
    if (mine.length) {
      const detail = await (await fetch(`${base()}/api/v1/message/${mine[0].ID}`)).json() as { Subject: string; Text: string; HTML: string };
      return { subject: detail.Subject, text: detail.Text, html: detail.HTML };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`No llegó ningún mail a ${to} en ${timeoutMs} ms`);
}

export async function countEmails(to: string): Promise<number> {
  const { messages = [] } = (await (await fetch(`${base()}/api/v1/messages`)).json()) as { messages?: Summary[] };
  return messages.filter((m) => m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase())).length;
}

/** Primer enlace de verificación/recuperación del mail. */
export function authLink(mail: { text: string; html: string }): string {
  const m = (mail.text + ' ' + mail.html).match(/https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify\?[^\s"'<>)]+/);
  if (!m) throw new Error('El mail no contiene un enlace de verificación');
  return m[0].replace(/&amp;/g, '&');
}
