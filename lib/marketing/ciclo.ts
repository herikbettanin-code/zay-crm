// Marketing — um ciclo: checa a conta de anúncios, avisa o dono só do que é novo
// (reaproveita a mesma tabela de dedupe da autonomia) e monta o relatório sob demanda.

import { query, one } from '@/lib/db';
import { checarMarketing } from './monitor';
import { enviarAoDono } from '@/lib/autonomia/alerta';
import { resumoConta, campanhasDesempenho, bibliotecaConcorrentes } from './meta';

const JANELA_HORAS = 12; // não repetir o MESMO alerta dentro de 12h

async function jaAlertado(chave: string): Promise<boolean> {
  const r = await one(
    `SELECT 1 FROM autonomia_alertas WHERE chave = $1 AND criado_em > now() - ($2 * interval '1 hour') LIMIT 1`,
    [chave, JANELA_HORAS]);
  return !!r;
}

async function marcarAlertado(chave: string, tipo: string): Promise<void> {
  await query(`INSERT INTO autonomia_alertas (chave, tipo) VALUES ($1, $2)`, [chave, tipo]);
}

export interface ResultadoCicloMkt { ok: boolean; verificados: number; novos: number; enviado: boolean; detalhe: string }

export async function rodarCicloMarketing(opts: { teste?: boolean } = {}): Promise<ResultadoCicloMkt> {
  if (opts.teste) {
    const r = await enviarAoDono('📊 ZAY — teste do agente de marketing: já consigo olhar seus anúncios da Truck e te avisar por aqui. Tudo certo!');
    return { ok: r.ok, verificados: 0, novos: 0, enviado: r.ok, detalhe: r.ok ? 'teste enviado' : (r.erro ?? 'falha no envio') };
  }

  const problemas = await checarMarketing();
  const novos = [];
  for (const p of problemas) if (!(await jaAlertado(p.chave))) novos.push(p);

  let enviado = false;
  if (novos.length > 0) {
    const ordem: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
    novos.sort((a, b) => (ordem[a.prioridade] ?? 3) - (ordem[b.prioridade] ?? 3));
    const linhas = novos.slice(0, 15).map((p) => `${p.prioridade === 'alta' ? '🔴' : p.prioridade === 'media' ? '🟡' : '⚪'} ${p.descricao}`);
    const msg = `📣 *ZAY — Marketing* (${novos.length} ${novos.length === 1 ? 'ponto' : 'pontos'}):\n\n${linhas.join('\n')}`;
    const r = await enviarAoDono(msg);
    enviado = r.ok;
    if (r.ok) for (const p of novos) await marcarAlertado(p.chave, p.tipo).catch(() => null);
  }

  return {
    ok: true,
    verificados: problemas.length,
    novos: novos.length,
    enviado,
    detalhe: novos.length === 0 ? 'tudo certo nos anúncios' : enviado ? 'alerta enviado no WhatsApp' : 'detectou, mas não consegui enviar',
  };
}

/** Relatório de desempenho sob demanda (não envia; retorna o texto pronto). */
export async function relatorioMarketing(datePreset = 'last_7d'): Promise<string> {
  const conta = await resumoConta();
  const camps = await campanhasDesempenho(datePreset);
  const totGasto = camps.reduce((s, c) => s + c.gasto, 0);
  const totLeads = camps.reduce((s, c) => s + c.leads, 0);
  const cplMedio = totLeads > 0 ? totGasto / totLeads : null;
  const linhas = camps.sort((a, b) => b.gasto - a.gasto).slice(0, 8).map(
    (c) => `• ${c.nome}: ${conta.moeda} ${c.gasto.toFixed(2)} · ${c.leads} leads${c.cpl != null ? ` · CPL ${c.cpl.toFixed(2)}` : ''}`);
  const cab = `📊 *Marketing — últimos 7 dias*\nSaldo: ${conta.saldo != null ? `${conta.moeda} ${conta.saldo.toFixed(2)}` : '—'} · Gasto: ${conta.moeda} ${totGasto.toFixed(2)} · Leads: ${totLeads}${cplMedio != null ? ` · CPL médio ${cplMedio.toFixed(2)}` : ''}`;
  return camps.length ? `${cab}\n\n${linhas.join('\n')}` : `${cab}\n\n(sem campanhas com dados no período)`;
}

/** Concorrentes na Biblioteca de Anúncios do Meta (sob demanda). */
export async function relatorioConcorrentes(termo: string): Promise<string> {
  const anuncios = await bibliotecaConcorrentes(termo);
  if (!anuncios.length) return `🔍 Nenhum anúncio ativo encontrado para "${termo}" na Biblioteca do Meta.`;
  const linhas = anuncios.slice(0, 10).map((a) => `• *${a.pagina}*: ${a.texto || '(sem texto)'}${a.link ? `\n  ${a.link}` : ''}`);
  return `🔍 *Concorrentes — "${termo}"* (${anuncios.length} anúncios ativos):\n\n${linhas.join('\n\n')}`;
}
