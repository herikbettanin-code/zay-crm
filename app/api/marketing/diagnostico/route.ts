import { NextRequest, NextResponse } from 'next/server';
import { contaFinanceiraBruta, metaConfigurada } from '@/lib/marketing/meta';

export const dynamic = 'force-dynamic';

// Diagnóstico financeiro da conta de anúncios — SÓ LEITURA, SEM IA.
// Mostra os campos crus da Meta (em centavos e já convertidos) pra descobrir
// qual deles corresponde ao "saldo disponível" que aparece no Gerenciador.
function autorizado(req: NextRequest): boolean {
  const seg = process.env.AUTONOMIA_SECRET?.trim();
  if (!seg) return true;
  return req.nextUrl.searchParams.get('k') === seg || req.headers.get('x-autonomia-key') === seg;
}

const emReais = (v: unknown): number | null => (v == null || v === '' ? null : Number(v) / 100);

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  if (!metaConfigurada()) return NextResponse.json({ ok: false, erro: 'Meta Ads ainda não configurado no servidor' });

  try {
    const bruto = await contaFinanceiraBruta();
    return NextResponse.json({
      ok: true,
      consultadoEm: new Date().toISOString(),
      moeda: bruto.currency,
      conta_pre_paga: bruto.is_prepay_account,
      // os 3 candidatos, em reais, pra comparar de olho com o Gerenciador:
      balance_reais: emReais(bruto.balance),             // "valor devido" segundo a Meta (é o que o painel mostra hoje)
      amount_spent_reais: emReais(bruto.amount_spent),   // total gasto
      spend_cap_reais: emReais(bruto.spend_cap),         // limite de gasto (0 = sem limite)
      funding_source_details: bruto.funding_source_details,
      // tudo cru, por garantia:
      bruto,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'falha ao ler o Meta' });
  }
}
