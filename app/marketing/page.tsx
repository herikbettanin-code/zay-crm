import { resumoConta, campanhasDesempenho, metaConfigurada, type CampanhaInsight } from '@/lib/marketing/meta';

// Painel de Anúncios (Meta Ads) — SÓ LEITURA. Protegido por senha no link (?k=...).
export const dynamic = 'force-dynamic';

function brl(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type SP = { [k: string]: string | string[] | undefined };
const umValor = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

export default async function MarketingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const k = umValor(sp.k);

  const segredo = process.env.AUTONOMIA_SECRET?.trim();
  if (segredo && k !== segredo) {
    return (
      <>
        <h1>Painel de Anúncios</h1>
        <p className="erro">Acesso restrito. Abra o painel pelo seu link com a senha.</p>
      </>
    );
  }

  if (!metaConfigurada()) {
    return (
      <>
        <h1>Painel de Anúncios</h1>
        <p className="erro">Meta Ads ainda não configurado (faltam META_TOKEN / META_AD_ACCOUNT no servidor).</p>
      </>
    );
  }

  const periodo = umValor(sp.periodo) === '30' ? '30' : '7';
  const preset = periodo === '30' ? 'last_30d' : 'last_7d';

  let saldoTxt = '—';
  let camps: CampanhaInsight[] = [];
  let erro = '';
  try {
    const [conta, cs] = await Promise.all([resumoConta(), campanhasDesempenho(preset)]);
    saldoTxt = conta.saldo != null ? brl(conta.saldo) : '—';
    camps = cs;
  } catch (e) {
    erro = e instanceof Error ? e.message : 'falha ao ler o Meta';
  }

  if (erro) {
    return (
      <>
        <h1>Painel de Anúncios</h1>
        <p className="erro">Não consegui ler o Meta Ads: {erro}</p>
      </>
    );
  }

  const totGasto = camps.reduce((s, c) => s + c.gasto, 0);
  const totLeads = camps.reduce((s, c) => s + c.leads, 0);
  const cplMedio = totLeads > 0 ? totGasto / totLeads : null;
  const ordenadas = [...camps].sort((a, b) => b.gasto - a.gasto);
  const base = `/marketing?k=${encodeURIComponent(k)}`;

  return (
    <>
      <h1>Painel de Anúncios — Meta Ads</h1>
      <p className="sub">Truckfort / RD Truck · desempenho das campanhas</p>

      <div className="tabs">
        <a className={periodo === '7' ? 'on' : ''} href={`${base}&periodo=7`}>7 dias</a>
        <a className={periodo === '30' ? 'on' : ''} href={`${base}&periodo=30`}>30 dias</a>
      </div>

      <div className="cards">
        <div className="card"><div className="rotulo">Saldo</div><div className="num">{saldoTxt}</div></div>
        <div className="card"><div className="rotulo">Gasto ({periodo} dias)</div><div className="num">{brl(totGasto)}</div></div>
        <div className="card"><div className="rotulo">Leads ({periodo} dias)</div><div className="num ok">{totLeads}</div></div>
        <div className="card"><div className="rotulo">CPL médio</div><div className="num">{cplMedio != null ? brl(cplMedio) : '—'}</div></div>
      </div>

      <div className="bloco">
        <h2>Campanhas ({periodo} dias)</h2>
        {ordenadas.length === 0 ? (
          <p className="vazio">Sem dados de campanha no período.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Campanha</th><th className="dir">Gasto</th><th className="dir">Leads</th><th className="dir">CPL</th></tr>
            </thead>
            <tbody>
              {ordenadas.map((c, i) => {
                const semLead = c.gasto > 0 && c.leads === 0;
                return (
                  <tr key={i}>
                    <td>{c.nome}</td>
                    <td className="dir">{brl(c.gasto)}</td>
                    <td className={'dir' + (semLead ? ' ruim' : '')}>{c.leads}</td>
                    <td className="dir">{c.cpl != null ? brl(c.cpl) : (semLead ? <span className="ruim">0 leads</span> : '—')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="muted nota">🔴 em vermelho = gastando sem gerar lead.</p>
      </div>
    </>
  );
}
