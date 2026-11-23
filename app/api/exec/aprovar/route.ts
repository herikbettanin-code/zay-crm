import { NextRequest, NextResponse } from 'next/server';
import { autorizadoAdmin } from '@/lib/executor/auth';
import { responderAprovacao } from '@/lib/executor/repo';

export const dynamic = 'force-dynamic';

interface Corpo { token?: string; decisao?: 'aprovar' | 'negar'; aprovar?: boolean }

// POST = o DONO aprova/nega uma ação crítica pelo token (vinculado à tarefa, com validade).
export async function POST(req: NextRequest) {
  if (!autorizadoAdmin(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Corpo;
  const token = String(body.token ?? '').trim().toUpperCase();
  if (!token) return NextResponse.json({ ok: false, erro: 'token obrigatório' }, { status: 400 });
  const aprovar = body.decisao === 'aprovar' || body.aprovar === true;
  const r = await responderAprovacao(token, aprovar);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
