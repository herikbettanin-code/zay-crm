import { NextRequest, NextResponse } from 'next/server';
import { probarCamposConta, metaConfigurada } from '@/lib/marketing/meta';

export const dynamic = 'force-dynamic';

// Diagnóstico financeiro da conta de anúncios — SÓ LEITURA, SEM IA.
// Testa cada campo separadamente: mostra o valor quando a Meta libera e
// o motivo quando ela bloqueia. Serve pra achar o campo do "saldo disponível".
function autorizado(req: NextRequest): boolean {
  const seg = process.env.AUTONOMIA_SECRET?.trim();
  if (!seg) return true;
  return req.nextUrl.searchParams.get('k') === seg || req.headers.get('x-autonomia-key') === seg;
}

const CAMPOS = [
  'currency',
  'is_prepay_account',
  'balance',
  'amount_spent',
  'spend_cap',
  'funding_source',
  'funding_source_details',
  'account_status',
  'min_campaign_group_spend_cap',
];

const emReais = (v: unknown): number | null =>
  v == null || v === '' || typeof v === 'object' ? null : Number(v) / 100;

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  if (!metaConfigurada()) return NextResponse.json({ ok: false, erro: 'Meta Ads ainda não configurado no servidor' });

  try {
    const campos = await probarCamposConta(CAMPOS);
    // valores de dinheiro vêm em centavos; mostro também em reais pra facilitar a comparação
    const reais = {
      balance_reais: emReais(campos.balance),
      amount_spent_reais: emReais(campos.amount_spent),
      spend_cap_reais: emReais(campos.spend_cap),
    };
    return NextResponse.json({ ok: true, consultadoEm: new Date().toISOString(), reais, campos });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'falha ao ler o Meta' });
  }
}
