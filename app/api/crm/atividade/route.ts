import { NextRequest, NextResponse } from 'next/server';
import { checarChave } from '@/lib/crm/auth';
import { criarAtividade } from '@/lib/crm/repo';
export async function POST(req: NextRequest) {
  const bloqueio = checarChave(req);
  if (bloqueio) return bloqueio;
  let body: { negocio_id?: number; empresa_id?: number; tipo?: string; descricao?: string; responsavel_id?: number; prazo?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!body.tipo) return NextResponse.json({ ok: false, erro: 'tipo é obrigatório' }, { status: 400 });
  try {
    const id = await criarAtividade({ ...body, tipo: body.tipo });
    return NextResponse.json({ ok: true, id, duplicada: id === 0 });
  } catch (e) { return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'erro' }, { status: 500 }); }
}
