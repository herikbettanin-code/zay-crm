// Cliente do WhatsApp COMERCIAL (Evolution API). Número SEPARADO do WhatsApp pessoal da ZAY.
// Tudo vem de variáveis de ambiente — nunca credenciais no código.

const TIMEOUT_MS = 20_000;

export function evoConfig(): { url: string; key: string; instance: string } {
  const url = (process.env.EVOLUTION_URL ?? '').replace(/\/+$/, '');
  const key = process.env.EVOLUTION_KEY ?? '';
  const instance = process.env.EVOLUTION_INSTANCE_COMERCIAL ?? '';
  return { url, key, instance };
}

export function evoConfigured(): boolean {
  const c = evoConfig();
  return !!(c.url && c.key && c.instance);
}

async function evo(method: 'GET' | 'POST', pathname: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const { url, key } = evoConfig();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}${pathname}`, {
      method,
      headers: { apikey: key, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/** Envia uma mensagem de texto pelo WhatsApp comercial. Devolve o ID da mensagem (p/ não confundir o eco com um vendedor). */
export async function enviarTexto(numero: string, texto: string): Promise<{ status: number; messageId?: string }> {
  const { instance } = evoConfig();
  const n = (numero ?? '').replace(/\D/g, '');
  const r = await evo('POST', `/message/sendText/${instance}`, { number: n, text: texto });
  const data = r.data as { key?: { id?: string } } | null;
  return { status: r.status, messageId: data?.key?.id };
}
