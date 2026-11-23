import { NextRequest, NextResponse } from 'next/server';
import { gerarRespostaComercial, type HistItem } from '@/lib/agente/cerebro';

export const dynamic = 'force-dynamic';

// SIMULAÇÃO do agente comercial: NÃO manda WhatsApp e NÃO grava no CRM.
// Só devolve a resposta que a ZAY daria — pra testar a inteligência SEM precisar do chip.
function autorizado(req: NextRequest): boolean {
  const seg = process.env.AUTONOMIA_SECRET?.trim() || process.env.WA_WEBHOOK_SECRET?.trim();
  if (!seg) return true;
  return req.nextUrl.searchParams.get('k') === seg || req.headers.get('x-autonomia-key') === seg;
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  let body: { nome?: string; mensagem?: string; historico?: HistItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: 'corpo inválido (envie JSON)' }, { status: 400 });
  }
  if (!body?.mensagem) return NextResponse.json({ ok: false, erro: 'informe "mensagem"' }, { status: 400 });
  try {
    const resposta = await gerarRespostaComercial({ nome: body.nome, mensagem: body.mensagem, historico: body.historico });
    return NextResponse.json({ ok: true, resposta });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'falha' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    servico: 'wa/simular',
    dica: 'POST JSON {"mensagem":"...","nome":"...(opcional)","historico":[...(opcional)]} com ?k=SEGREDO. Devolve a resposta da ZAY, sem mandar WhatsApp nem gravar no CRM.',
  });
}
