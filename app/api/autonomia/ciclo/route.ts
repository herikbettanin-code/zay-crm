import { NextRequest, NextResponse } from 'next/server';
import { rodarCiclo } from '@/lib/autonomia/ciclo';
import { enviarRelatorioDiario } from '@/lib/autonomia/relatorio';

export const dynamic = 'force-dynamic';

// Protege o endpoint com um segredo (?k=... ou header x-autonomia-key).
function autorizado(req: NextRequest): boolean {
  const seg = process.env.AUTONOMIA_SECRET?.trim();
  if (!seg) return true; // sem segredo definido → liberado (modo local)
  return req.nextUrl.searchParams.get('k') === seg || req.headers.get('x-autonomia-key') === seg;
}

// POST roda UM ciclo. ?teste=1 envia alerta de teste. ?relatorio=1 envia o briefing comercial diário.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get('relatorio') === '1') return NextResponse.json(await enviarRelatorioDiario());
    const teste = sp.get('teste') === '1';
    return NextResponse.json(await rodarCiclo({ teste }));
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'falha' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    servico: 'autonomia/ciclo',
    dica: 'POST ?k=SEGREDO roda um ciclo; ?teste=1 envia teste; ?relatorio=1 envia o resumo comercial diário.',
  });
}
