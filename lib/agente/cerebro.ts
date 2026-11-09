// Cérebro do atendimento comercial (Etapa 2b): monta o contexto da conversa e pede a resposta ao Claude.

import { chamarClaude } from './claude';
import { PROMPT_COMERCIAL } from './prompt';

export interface HistItem { direcao?: string; resumo?: string }

/** Gera a resposta da ZAY comercial para a nova mensagem do cliente, usando o histórico do negócio. */
export async function gerarRespostaComercial(ctx: { nome?: string; mensagem: string; historico?: HistItem[] }): Promise<string> {
  const transcript = (ctx.historico ?? [])
    .map((h) => `${h.direcao === 'enviada' ? 'ZAY' : 'Cliente'}: ${h.resumo ?? ''}`)
    .join('\n');

  const user =
    `Cliente: ${ctx.nome || 'não informado'}\n\n` +
    `Histórico recente da conversa:\n${transcript || '(esta é a primeira mensagem)'}\n\n` +
    `Nova mensagem do cliente:\n${ctx.mensagem}\n\n` +
    `Responda como a ZAY da Truckfort, seguindo as regras. Apenas a resposta, sem aspas.`;

  return (await chamarClaude({ system: PROMPT_COMERCIAL, user, maxTokens: 400 })).trim();
}
