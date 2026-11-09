import { NextRequest, NextResponse } from 'next/server';
import { rodarCiclo } from '@/lib/autonomia/ciclo';

export const dynamic = 'force-dynamic';

// Protege o endpoint com um segredo (?k=... ou header x-autonomia-key).
function autorizado(req: NextRequest): boolean {
  const seg = process.env.AUTONOMIA_SECRET?.trim();
  if (!seg) return true; // sem segredo definido → liberado (modo local)
  return req.nextUrl.searchParams.get('k') === seg || req.headers.get('x-autonomia-key') === seg;
}

// POST roda UM ciclo. ?teste=1 envia um alerta de teste para provar a entrega.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  const teste = req.nextUrl.searchParams.get('teste') === '1';
  try {
    const r = await rodarCiclo({ teste });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'falha' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    servico: 'autonomia/ciclo',
    dica: 'Use POST com ?k=SEGREDO para rodar um ciclo. ?teste=1 envia um alerta de teste no WhatsApp.',
  });
}
