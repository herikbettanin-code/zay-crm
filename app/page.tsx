import { funil, negociosParados } from '@/lib/crm/repo';

// Sempre dados frescos do banco (nada de cache).
export const dynamic = 'force-dynamic';

interface EtapaFunil { ordem: number; etapa: string; quantidade: number; valor: string }
interface Parado { id: number; titulo: string; nome_fantasia: string; proxima_acao: string; proxima_acao_em: string }

function brl(v: string | number) {
  const n = Number(v) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function dataBR(d: string) {
  return d ? new Date(d).toLocaleDateString('pt-BR') : '—';
}

export default async function Page() {
  let etapas: EtapaFunil[] = [];
  let parados: Parado[] = [];
  let erro = '';
  try {
    etapas = (await funil()) as unknown as EtapaFunil[];
    parados = (await negociosParados()) as unknown as Parado[];
  } catch {
    erro = 'Não consegui conectar no banco. Confira o DATABASE_URL no arquivo .env.local.';
  }

  if (erro) {
    return (
      <>
        <h1>Funil comercial</h1>
        <p className="erro">{erro}</p>
      </>
    );
  }

  const totalAbertos = etapas.reduce((s, e) => s + (e.quantidade || 0), 0);

  return (
    <>
      <h1>Funil comercial</h1>
      <p className="sub">{totalAbertos} negócio(s) em aberto</p>

      <div className="funil">
        {etapas.map((e) => (
          <div className="coluna" key={e.ordem}>
            <h3>{e.etapa}</h3>
            <div className="qtd">{e.quantidade}</div>
            <div className="valor">{brl(e.valor)}</div>
          </div>
        ))}
      </div>

      <div className="bloco">
        <h2>Precisam de atenção (próxima ação vencida)</h2>
        {parados.length === 0 ? (
          <p className="vazio">Nada parado. Tudo em dia.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Empresa</th><th>Negócio</th><th>Próxima ação</th><th>Desde</th></tr>
            </thead>
            <tbody>
              {parados.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome_fantasia || '—'}</td>
                  <td>{p.titulo}</td>
                  <td>{p.proxima_acao || '—'}</td>
                  <td className="atraso">{dataBR(p.proxima_acao_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
