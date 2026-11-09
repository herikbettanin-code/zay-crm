// Autonomia — um ciclo: detecta problemas no CRM, filtra o que é novo (sem repetir alerta)
// e avisa o dono pelo WhatsApp. Modo "observar + avisar" apenas (não age sozinha nesta etapa).

import { query, one } from '@/lib/db';
import { detectarProblemas, type Problema } from './monitor';
import { enviarAoDono } from './alerta';

const JANELA_HORAS = 24; // não repetir o MESMO alerta dentro de 24h
const EMOJI: Record<string, string> = { alta: '🔴', media: '🟡', baixa: '⚪' };

async function jaAlertado(chave: string): Promise<boolean> {
  const r = await one(
    `SELECT 1 FROM autonomia_alertas WHERE chave = $1 AND criado_em > now() - ($2 * interval '1 hour') LIMIT 1`,
    [chave, JANELA_HORAS]);
  return !!r;
}

async function marcarAlertado(chave: string, tipo: string): Promise<void> {
  await query(`INSERT INTO autonomia_alertas (chave, tipo) VALUES ($1, $2)`, [chave, tipo]);
}

export interface ResultadoCiclo {
  ok: boolean;
  verificados: number;
  novos: number;
  enviado: boolean;
  detalhe: string;
}

export async function rodarCiclo(opts: { teste?: boolean } = {}): Promise<ResultadoCiclo> {
  // Modo teste: só manda um alerta de exemplo para provar a entrega.
  if (opts.teste) {
    const r = await enviarAoDono('🔔 ZAY — teste de autonomia: estou vigiando o CRM e consigo te avisar por aqui. Tudo certo!');
    return { ok: r.ok, verificados: 0, novos: 0, enviado: r.ok, detalhe: r.ok ? 'teste enviado' : (r.erro ?? 'falha no envio') };
  }

  const problemas = await detectarProblemas();
  const novos: Problema[] = [];
  for (const p of problemas) {
    if (!(await jaAlertado(p.chave))) novos.push(p);
  }

  let enviado = false;
  if (novos.length > 0) {
    const ordem: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
    novos.sort((a, b) => (ordem[a.prioridade] ?? 3) - (ordem[b.prioridade] ?? 3));
    const linhas = novos.slice(0, 15).map((p) => `${EMOJI[p.prioridade] ?? '•'} ${p.descricao}`);
    const extra = novos.length > 15 ? `\n…e mais ${novos.length - 15}.` : '';
    const msg = `⚠️ *ZAY — atenção no comercial* (${novos.length} ${novos.length === 1 ? 'ponto' : 'pontos'}):\n\n${linhas.join('\n')}${extra}`;
    const r = await enviarAoDono(msg);
    enviado = r.ok;
    if (r.ok) {
      for (const p of novos) await marcarAlertado(p.chave, p.tipo).catch(() => null);
    }
  }

  return {
    ok: true,
    verificados: problemas.length,
    novos: novos.length,
    enviado,
    detalhe: novos.length === 0 ? 'nada novo — tudo em dia' : enviado ? 'alerta enviado no WhatsApp' : 'detectou, mas não consegui enviar',
  };
}
