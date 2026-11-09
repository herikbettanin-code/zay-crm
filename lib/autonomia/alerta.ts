// Autonomia — envio de alertas para o DONO, pelo WhatsApp pessoal da ZAY (número 8447 que já existe).
// Usa a mesma Evolution API, mas a instância da ZAY (não a comercial). Credenciais só por variável de ambiente.

const TIMEOUT_MS = 20_000;

export function autonomiaConfigurada(): boolean {
  return !!(process.env.EVOLUTION_URL && process.env.EVOLUTION_KEY && process.env.EVOLUTION_INSTANCE_ZAY && process.env.ZAY_OWNER);
}

/** Manda um texto para o dono no WhatsApp da ZAY. */
export async function enviarAoDono(texto: string): Promise<{ ok: boolean; status?: number; erro?: string }> {
  const url = (process.env.EVOLUTION_URL ?? '').replace(/\/+$/, '');
  const key = process.env.EVOLUTION_KEY ?? '';
  const instance = process.env.EVOLUTION_INSTANCE_ZAY ?? '';
  const owner = process.env.ZAY_OWNER ?? '';
  if (!url || !key || !instance || !owner) {
    return { ok: false, erro: 'autonomia não configurada (EVOLUTION_URL/KEY, EVOLUTION_INSTANCE_ZAY, ZAY_OWNER)' };
  }
  const number = owner.includes('@') ? owner : owner.replace(/\D/g, '');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/message/sendText/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({ number, text: texto }),
      signal: ctl.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha no envio' };
  } finally {
    clearTimeout(timer);
  }
}
