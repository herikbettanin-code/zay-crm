import { NextRequest, NextResponse } from 'next/server';
import { resumoConta, campanhasDesempenho, metaConfigurada, type CampanhaInsight } from '@/lib/marketing/meta';

export const dynamic = 'force-dynamic';

// Dados do painel de anúncios — SÓ LEITURA, SEM IA (código + API da Meta direto).
// Cache curto COMPARTILHADO: vários acessos no mesmo ~25s reusam a última consulta (não multiplica chamadas à Meta).
interface Dados {
  ok: true; consultadoEm: string; moeda: string; saldo: number | null; limite: number | null;
  status: number | null; gasto: number; leads: number; cpl: number | null; campanhas: CampanhaInsight[]; periodo: string;
}
let cache: { ts: number; periodo: string; dados: Dados } | null = null;
const TTL_MS = 25_000;

function autorizado(req: NextRequest): boolean {
  const seg = process.env.AUTONOMIA_SECRET?.trim();
  if (!seg) return true;
  return req.nextUrl.searchParams.get('k') === seg || req.headers.get('x-autonomia-key') === seg;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  if (!metaConfigurada()) return NextResponse.json({ ok: false, erro: 'Meta Ads ainda não configurado no servidor' });

  const periodo = req.nextUrl.searchParams.get('periodo') === '30' ? '30' : '7';

  // Reusa a última consulta se ainda está fresca (centraliza as requisições à Meta).
  if (cache && cache.periodo === periodo && Date.now() - cache.ts < TTL_MS) {
    return NextResponse.json({ ...cache.dados, cacheReusado: true });
  }

  try {
    const preset = periodo === '30' ? 'last_30d' : 'last_7d';
    const [conta, camps] = await Promise.all([resumoConta(), campanhasDesempenho(preset)]);
    const gasto = camps.reduce((s, c) => s + c.gasto, 0);
    const leads = camps.reduce((s, c) => s + c.leads, 0);
    const dados: Dados = {
      ok: true,
      consultadoEm: new Date().toISOString(),
      moeda: conta.moeda,
      saldo: conta.saldo,          // balance = saldo DISPONÍVEL (não é o limite)
      limite: conta.limite,
      status: conta.status,
      gasto,
      leads,
      cpl: leads > 0 ? gasto / leads : null,
      campanhas: [...camps].sort((a, b) => b.gasto - a.gasto),
      periodo,
    };
    cache = { ts: Date.now(), periodo, dados };
    return NextResponse.json(dados);
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'falha ao ler o Meta';
    // Recuperação: se já temos um dado bom, devolve ele marcado como desatualizado (não quebra o painel).
    if (cache && cache.periodo === periodo) {
      return NextResponse.json({ ...cache.dados, falhaMeta: erro, desatualizadoDesde: new Date(cache.ts).toISOString() });
    }
    return NextResponse.json({ ok: false, erro });
  }
}
