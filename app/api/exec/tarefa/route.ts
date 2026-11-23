import { NextRequest, NextResponse } from 'next/server';
import { autorizadoAdmin } from '@/lib/executor/auth';
import { criarTarefa, listarTarefas, statusTarefa, cancelar } from '@/lib/executor/repo';

export const dynamic = 'force-dynamic';

interface Corpo { objetivo?: string; projeto?: string; tipo?: string; prioridade?: number; idempotencia?: string; id?: number }

// POST = criar tarefa (admin). ?acao=cancelar + {id} = cancelar/kill de uma tarefa.
export async function POST(req: NextRequest) {
  if (!autorizadoAdmin(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Corpo;

  if (req.nextUrl.searchParams.get('acao') === 'cancelar') {
    const id = Number(body.id);
    if (!id) return NextResponse.json({ ok: false, erro: 'id obrigatório' }, { status: 400 });
    await cancelar(id);
    return NextResponse.json({ ok: true, cancelada: id });
  }

  const r = await criarTarefa({
    objetivo: body.objetivo ?? '', projeto: body.projeto ?? null, tipo: body.tipo,
    prioridade: body.prioridade, idempotencia: body.idempotencia, criado_por: 'admin',
  });
  if ('erro' in r) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id });
}

// GET = status de uma tarefa (?id=) ou lista das últimas.
export async function GET(req: NextRequest) {
  if (!autorizadoAdmin(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (id) return NextResponse.json({ ok: true, tarefa: await statusTarefa(Number(id)) });
  return NextResponse.json({ ok: true, tarefas: await listarTarefas() });
}
