import { NextRequest, NextResponse } from 'next/server';
import { autorizadoWorker } from '@/lib/executor/auth';
import { pegarProxima, logar, concluir, pedirAprovacao, heartbeat } from '@/lib/executor/repo';

export const dynamic = 'force-dynamic';

interface Corpo { tarefa_id?: number; mensagem?: string; nivel?: 'info' | 'aviso' | 'erro'; status?: string; texto?: string; acao_descricao?: string; minutos?: number }

// GET = o worker pega a próxima tarefa pendente (poll barato em SQL; ocioso não gasta IA).
export async function GET(req: NextRequest) {
  if (!autorizadoWorker(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  const t = await pegarProxima();
  return NextResponse.json({ ok: true, tarefa: t });
}

// POST = ações do worker: ?acao=progresso|heartbeat|concluir|aprovacao.
export async function POST(req: NextRequest) {
  if (!autorizadoWorker(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  const acao = req.nextUrl.searchParams.get('acao');
  const body = ((await req.json().catch(() => null)) ?? {}) as Corpo;
  const id = Number(body.tarefa_id);
  if (!id) return NextResponse.json({ ok: false, erro: 'tarefa_id obrigatório' }, { status: 400 });

  try {
    if (acao === 'progresso') { await logar(id, String(body.mensagem ?? ''), body.nivel ?? 'info'); return NextResponse.json({ ok: true }); }
    if (acao === 'heartbeat') { await heartbeat(id); return NextResponse.json({ ok: true }); }
    if (acao === 'concluir') { await concluir(id, body.status === 'erro' ? 'erro' : 'concluida', String(body.texto ?? '')); return NextResponse.json({ ok: true }); }
    if (acao === 'aprovacao') { const r = await pedirAprovacao(id, String(body.acao_descricao ?? 'ação crítica'), Number(body.minutos ?? 15)); return NextResponse.json({ ok: true, ...r }); }
    return NextResponse.json({ ok: false, erro: 'acao inválida' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'falha' }, { status: 500 });
  }
}
