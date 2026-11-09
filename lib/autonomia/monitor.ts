// Autonomia — Etapa 1: as 5 verificações do CRM. Tudo por consulta SQL (grátis, sem IA).
// Cada problema tem uma "chave" estável para não repetir alerta.

import { query } from '@/lib/db';

export interface Problema {
  tipo: string;
  chave: string;
  prioridade: 'alta' | 'media' | 'baixa';
  descricao: string;
}

const MIN_LEAD = 30;     // minutos: lead novo sem atendimento
const MIN_SEM_RESP = 60; // minutos: oportunidade aberta sem responsável

/** 1) Leads novos (etapa "Novo lead") parados há um tempo sem ninguém ter respondido. */
export async function leadsNovosSemAtendimento(): Promise<Problema[]> {
  const rows = await query<{ id: number; titulo: string; nome_fantasia: string }>(
    `SELECT n.id, n.titulo, e.nome_fantasia
     FROM negocios n JOIN empresas e ON e.id = n.empresa_id
     JOIN funil_etapas fe ON fe.id = n.etapa_id
     WHERE n.status = 'aberto' AND lower(fe.nome) = 'novo lead'
       AND n.criado_em < now() - ($1 * interval '1 minute')
       AND NOT EXISTS (SELECT 1 FROM interacoes i WHERE i.negocio_id = n.id AND i.direcao = 'enviada')
     ORDER BY n.criado_em LIMIT 20`, [MIN_LEAD]);
  return rows.map((r) => ({ tipo: 'lead_sem_atendimento', chave: `lead_sem_atendimento:${r.id}`, prioridade: 'alta', descricao: `Lead sem atendimento: ${r.nome_fantasia} (${r.titulo})` }));
}

/** 2) Negócios/propostas parados: a próxima ação já venceu. */
export async function propostasParadas(): Promise<Problema[]> {
  const rows = await query<{ id: number; titulo: string; nome_fantasia: string; proxima_acao: string | null }>(
    `SELECT n.id, n.titulo, e.nome_fantasia, n.proxima_acao
     FROM negocios n JOIN empresas e ON e.id = n.empresa_id
     WHERE n.status = 'aberto' AND n.proxima_acao_em IS NOT NULL AND n.proxima_acao_em < CURRENT_DATE
     ORDER BY n.proxima_acao_em LIMIT 20`);
  return rows.map((r) => ({ tipo: 'negocio_parado', chave: `negocio_parado:${r.id}`, prioridade: 'media', descricao: `Negócio parado: ${r.nome_fantasia} (${r.titulo})${r.proxima_acao ? ` — ação pendente: ${r.proxima_acao}` : ''}` }));
}

/** 3) Follow-ups (atividades) com prazo vencido e ainda pendentes. */
export async function followupsVencidos(): Promise<Problema[]> {
  const rows = await query<{ id: number; tipo: string; descricao: string | null }>(
    `SELECT a.id, a.tipo, a.descricao FROM atividades a
     WHERE a.status = 'pendente' AND a.prazo IS NOT NULL AND a.prazo < now()
     ORDER BY a.prazo LIMIT 20`);
  return rows.map((r) => ({ tipo: 'followup_vencido', chave: `followup_vencido:${r.id}`, prioridade: 'alta', descricao: `Follow-up vencido: ${r.descricao || r.tipo}` }));
}

/** 4) Oportunidades abertas sem vendedor responsável. */
export async function oportunidadesSemResponsavel(): Promise<Problema[]> {
  const rows = await query<{ id: number; titulo: string; nome_fantasia: string }>(
    `SELECT n.id, n.titulo, e.nome_fantasia
     FROM negocios n JOIN empresas e ON e.id = n.empresa_id
     WHERE n.status = 'aberto' AND n.vendedor_id IS NULL
       AND n.criado_em < now() - ($1 * interval '1 minute')
     ORDER BY n.criado_em LIMIT 20`, [MIN_SEM_RESP]);
  return rows.map((r) => ({ tipo: 'sem_responsavel', chave: `sem_responsavel:${r.id}`, prioridade: 'media', descricao: `Oportunidade sem responsável: ${r.nome_fantasia} (${r.titulo})` }));
}

/** 5) Erros de integração WhatsApp↔CRM (fila de pendências de sincronização). */
export async function errosWhatsappCrm(): Promise<Problema[]> {
  const rows = await query<{ id: number; tipo: string; ultimo_erro: string | null }>(
    `SELECT id, tipo, ultimo_erro FROM sync_pendencias WHERE resolvido = false ORDER BY criado_em LIMIT 20`);
  return rows.map((r) => ({ tipo: 'erro_sync', chave: `erro_sync:${r.id}`, prioridade: 'alta', descricao: `Erro de integração (${r.tipo})${r.ultimo_erro ? `: ${r.ultimo_erro}` : ''}` }));
}

/** Roda as 5 verificações. Se uma falhar, as outras seguem. */
export async function detectarProblemas(): Promise<Problema[]> {
  const grupos = await Promise.all([
    leadsNovosSemAtendimento().catch(() => [] as Problema[]),
    propostasParadas().catch(() => [] as Problema[]),
    followupsVencidos().catch(() => [] as Problema[]),
    oportunidadesSemResponsavel().catch(() => [] as Problema[]),
    errosWhatsappCrm().catch(() => [] as Problema[]),
  ]);
  return grupos.flat();
}
