import { NextRequest, NextResponse } from 'next/server';
import { rodarCicloMarketing, relatorioMarketing, relatorioConcorrentes } from '@/lib/marketing/ciclo';

export const dynamic = 'force-dynamic';

// Mesmo segredo da autonomia (?k=... ou header x-autonomia-key).
function autorizado(req: NextRequest): boolean {
  const seg = process.env.AUTONOMIA_SECRET?.trim();
  if (!seg) return true;
  return req.nextUrl.searchParams.get('k') === seg || req.headers.get('x-autonomia-key') === seg;
}

// POST roda um ciclo de marketing. ?teste=1 envia um alerta de teste.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  const teste = req.nextUrl.searchParams.get('teste') === '1';
  try {
    return NextResponse.json(await rodarCicloMarketing({ teste }));
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'falha' }, { status: 500 });
  }
}

// GET: relatório sob demanda. ?relatorio=1 (desempenho) ou ?concorrente=TERMO (biblioteca de anúncios).
export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: true, servico: 'marketing/ciclo', dica: 'POST ?k=SEGREDO roda o ciclo; ?teste=1 envia teste. GET ?k=SEGREDO&relatorio=1 mostra o desempenho; &concorrente=TERMO busca anúncios de concorrentes.' });
  }
  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get('relatorio') === '1') return NextResponse.json({ ok: true, texto: await relatorioMarketing() });
    const termo = sp.get('concorrente');
    if (termo) return NextResponse.json({ ok: true, texto: await relatorioConcorrentes(termo) });
    return NextResponse.json({ ok: true, servico: 'marketing/ciclo' });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'falha' }, { status: 500 });
  }
}
