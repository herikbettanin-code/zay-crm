// Cliente da API do Claude (Anthropic) para o agente comercial.
// Reaproveita a mesma chave que a ZAY já usa — nada de credencial no código.

const API = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 30_000;

function apiKey(): string {
  return process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? '';
}

export function claudeConfigured(): boolean {
  return !!apiKey();
}

interface ClaudeResposta {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
}

/** Chama o Claude com um prompt de sistema e uma mensagem do usuário. Retorna só o texto. */
export async function chamarClaude(opts: { system: string; user: string; maxTokens?: number }): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada');
  const model = process.env.CLAUDE_MODEL_COMERCIAL ?? process.env.CLAUDE_MODEL ?? 'claude-haiku-5-5';

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 500,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      }),
      signal: ctl.signal,
    });
    const data = (await res.json().catch(() => null)) as ClaudeResposta | null;
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return (data?.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('')
      .trim();
  } finally {
    clearTimeout(timer);
  }
}
