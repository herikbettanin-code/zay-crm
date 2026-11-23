import { randomBytes } from 'crypto';
import { query, one } from '@/lib/db';
import { limites, projetoAutorizado } from './limites';
import type { Tarefa } from './tipos';

const COLS = 'id, objetivo, tipo, projeto, status, prioridade, origem, tentativas, max_tentativas, timeout_seg, resultado, erro';

/** Cria tarefa (só canal admin). Respeita kill switch + lista branca de projetos. Idempotente. */
export async function criarTarefa(t: {
  objetivo: string; projeto?: string | null; tipo?: string; prioridade?: number;
  idempotencia?: string; timeout_seg?: number; max_tentativas?: number; criado_por?: string;
}): Promise<{ id: number } | { erro: string }> {
  const lim = limites();
  if (lim.bloquearNovas) return { erro: 'executor bloqueado (kill switch ativo)' };
  if (!t.objetivo?.trim()) return { erro: 'objetivo vazio' };
  if (t.projeto && !projetoAutorizado(t.projeto)) return { erro: `projeto não autorizado: ${t.projeto}` };

  const row = await one<{ id: number }>(
    `INSERT INTO exec_tarefas (objetivo, projeto, tipo, prioridade, origem, idempotencia, timeout_seg, max_tentativas, criado_por)
     VALUES ($1,$2,$3,$4,'admin',$5,$6,$7,$8)
     ON CONFLICT (idempotencia) DO NOTHING RETURNING id`,
    [t.objetivo.trim(), t.projeto ?? null, t.tipo ?? 'auto', t.prioridade ?? 5, t.idempotencia ?? null,
     t.timeout_seg ?? lim.timeoutSegPadrao, t.max_tentativas ?? lim.maxTentativas, t.criado_por ?? 'admin']);
  if (row) return { id: row.id };
  if (t.idempotencia) {
    const ja = await one<{ id: number }>(`SELECT id FROM exec_tarefas WHERE idempotencia = $1`, [t.idempotencia]);
    if (ja) return { id: ja.id };
  }
  return { erro: 'falha ao criar tarefa' };
}

/** Worker pega a próxima tarefa pendente (atômico, respeita o máximo de simultâneas). */
export async function pegarProxima(): Promise<Tarefa | null> {
  const lim = limites();
  if (lim.bloquearNovas) return null;
  const run = await one<{ n: number }>(`SELECT count(*)::int AS n FROM exec_tarefas WHERE status = 'rodando'`);
  if ((run?.n ?? 0) >= lim.maxSimultaneas) return null;
  const row = await one<Tarefa>(
    `UPDATE exec_tarefas SET status='rodando', iniciado_em=COALESCE(iniciado_em, now()), heartbeat_em=now(), tentativas=tentativas+1
     WHERE id = (SELECT id FROM exec_tarefas WHERE status='pendente' ORDER BY prioridade, criado_em FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING ${COLS}`);
  return row ?? null;
}

export async function heartbeat(id: number): Promise<void> {
  await query(`UPDATE exec_tarefas SET heartbeat_em = now() WHERE id = $1`, [id]);
}

export async function logar(tarefaId: number, mensagem: string, nivel: 'info' | 'aviso' | 'erro' = 'info'): Promise<void> {
  await query(`INSERT INTO exec_logs (tarefa_id, nivel, mensagem) VALUES ($1,$2,$3)`, [tarefaId, nivel, mensagem]);
  await heartbeat(tarefaId).catch(() => null);
}

export async function concluir(id: number, status: 'concluida' | 'erro', texto: string): Promise<void> {
  if (status === 'erro') await query(`UPDATE exec_tarefas SET status='erro', erro=$2, concluido_em=now() WHERE id=$1`, [id, texto]);
  else await query(`UPDATE exec_tarefas SET status='concluida', resultado=$2, concluido_em=now() WHERE id=$1`, [id, texto]);
}

/** Worker pede aprovação pra ação crítica: gera token + validade e põe a tarefa em aguardando_aprovacao. */
export async function pedirAprovacao(tarefaId: number, acao: string, minutos = 15): Promise<{ token: string; valido_ate: string }> {
  const token = randomBytes(4).toString('hex').toUpperCase(); // 8 hex, vinculado à tarefa
  const row = await one<{ valido_ate: string }>(
    `INSERT INTO exec_aprovacoes (tarefa_id, acao, token, valido_ate)
     VALUES ($1,$2,$3, now() + ($4 * interval '1 minute')) RETURNING valido_ate`,
    [tarefaId, acao, token, minutos]);
  await query(`UPDATE exec_tarefas SET status='aguardando_aprovacao' WHERE id=$1`, [tarefaId]);
  return { token, valido_ate: row!.valido_ate };
}

/** Dono aprova/nega por token. Valida a validade. Aprovada → tarefa volta a pendente; negada → cancelada. */
export async function responderAprovacao(token: string, aprovar: boolean): Promise<{ ok: boolean; tarefa_id?: number; erro?: string }> {
  const ap = await one<{ id: number; tarefa_id: number; status: string; expirou: boolean }>(
    `SELECT id, tarefa_id, status, (valido_ate < now()) AS expirou FROM exec_aprovacoes WHERE token = $1`, [token]);
  if (!ap) return { ok: false, erro: 'token inválido' };
  if (ap.status !== 'pendente') return { ok: false, erro: `aprovação já ${ap.status}` };
  if (ap.expirou) {
    await query(`UPDATE exec_aprovacoes SET status='expirada' WHERE id=$1`, [ap.id]);
    await query(`UPDATE exec_tarefas SET status='expirada' WHERE id=$1`, [ap.tarefa_id]);
    return { ok: false, erro: 'token expirado' };
  }
  await query(`UPDATE exec_aprovacoes SET status=$2, respondido_em=now() WHERE id=$1`, [ap.id, aprovar ? 'aprovada' : 'negada']);
  await query(`UPDATE exec_tarefas SET status=$2 WHERE id=$1`, [ap.tarefa_id, aprovar ? 'pendente' : 'cancelada']);
  return { ok: true, tarefa_id: ap.tarefa_id };
}

/** Última aprovação de uma tarefa (o worker consulta pra saber se pode retomar a ação crítica). */
export async function ultimaAprovacao(tarefaId: number) {
  return one<{ acao: string; token: string; status: string; valido_ate: string }>(
    `SELECT acao, token, status, valido_ate FROM exec_aprovacoes WHERE tarefa_id=$1 ORDER BY criado_em DESC LIMIT 1`, [tarefaId]);
}

export async function listarTarefas(limit = 20) {
  return query(`SELECT ${COLS}, criado_em, concluido_em FROM exec_tarefas ORDER BY criado_em DESC LIMIT $1`, [limit]);
}
export async function statusTarefa(id: number) {
  return one(`SELECT ${COLS}, criado_em, iniciado_em, concluido_em, heartbeat_em FROM exec_tarefas WHERE id=$1`, [id]);
}
export async function cancelar(id: number): Promise<void> {
  await query(`UPDATE exec_tarefas SET status='cancelada', concluido_em=now() WHERE id=$1 AND status IN ('pendente','aguardando_aprovacao','rodando')`, [id]);
}
