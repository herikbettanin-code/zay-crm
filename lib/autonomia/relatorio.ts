// Autonomia — relatório comercial diário. Reaproveita as verificações do monitor (detectarProblemas)
// e monta um briefing pra enviar no WhatsApp do dono. Sempre envia (mesmo sem pendências).

import { detectarProblemas, type Problema } from './monitor';
import { enviarAoDono } from './alerta';

const ROTULOS: Record<string, string> = {
  lead_sem_atendimento: 'leads sem atendimento',
  negocio_parado: 'negócios/propostas parados',
  followup_vencido: 'follow-ups vencidos',
  sem_responsavel: 'oportunidades sem responsável',
  erro_sync: 'erros de integração WhatsApp↔CRM',
};

/** Monta o texto do briefing a partir dos problemas detectados. */
export function montarRelatorio(problemas: Problema[]): string {
  if (problemas.length === 0) {
    return '☀️ *ZAY — Bom dia!*\nResumo comercial: tudo em dia. Nenhum lead sem atendimento, proposta parada ou pendência no CRM. 👏';
  }

  const porTipo = new Map<string, Problema[]>();
  for (const p of problemas) {
    const arr = porTipo.get(p.tipo) ?? [];
    arr.push(p);
    porTipo.set(p.tipo, arr);
  }

  // Ordena os blocos por prioridade do grupo (alta primeiro)
  const pesoPrioridade: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
  const grupos = [...porTipo.entries()].sort((a, b) => {
    const pa = Math.min(...a[1].map((x) => pesoPrioridade[x.prioridade] ?? 3));
    const pb = Math.min(...b[1].map((x) => pesoPrioridade[x.prioridade] ?? 3));
    return pa - pb;
  });

  const linhas: string[] = [];
  for (const [tipo, itens] of grupos) {
    const rotulo = ROTULOS[tipo] ?? tipo;
    linhas.push(`\n*${itens.length} ${rotulo}:*`);
    for (const it of itens.slice(0, 5)) linhas.push(`• ${it.descricao}`);
    if (itens.length > 5) linhas.push(`…e mais ${itens.length - 5}.`);
  }

  return `☀️ *ZAY — Resumo comercial de hoje* (${problemas.length} ${problemas.length === 1 ? 'ponto' : 'pontos'} de atenção):\n${linhas.join('\n')}`;
}

/** Detecta as pendências do CRM e envia o briefing no WhatsApp do dono. */
export async function enviarRelatorioDiario(): Promise<{ ok: boolean; total: number; enviado: boolean; detalhe: string }> {
  const problemas = await detectarProblemas();
  const texto = montarRelatorio(problemas);
  const r = await enviarAoDono(texto);
  return {
    ok: true,
    total: problemas.length,
    enviado: r.ok,
    detalhe: r.ok ? 'relatório enviado no WhatsApp' : (r.erro ?? 'falha no envio'),
  };
}
