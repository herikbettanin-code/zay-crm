import { NextRequest, NextResponse } from 'next/server';
import { checarChave } from '@/lib/crm/auth';
import { registrarInteracao } from '@/lib/crm/repo';
export async function POST(req: NextRequest) {
  const bloqueio = checarChave(req);
  if (bloqueio) return bloqueio;
  let body: { empresa_id?: number; contato_id?: number; negocio_id?: number; canal?: string; direcao?: 'recebida' | 'enviada'; por?: 'ia' | 'humano' | 'cliente'; resumo?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!body.resumo) return NextResponse.json({ ok: false, erro: 'resumo é obrigatório' }, { status: 400 });
  try { await registrarInteracao({ ...body, resumo: body.resumo }); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'erro' }, { status: 500 }); }
}
