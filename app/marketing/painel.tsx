'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Campanha { nome: string; gasto: number; impressoes: number; leads: number; cpl: number | null }
interface Dados {
  ok?: boolean; erro?: string; consultadoEm?: string; moeda?: string; saldo?: number | null;
  limite?: number | null; gasto?: number; leads?: number; cpl?: number | null; campanhas?: Campanha[];
  periodo?: string; falhaMeta?: string; desatualizadoDesde?: string; cacheReusado?: boolean;
}

const INTERVALO_S = 30; // atualização automática

function brl(moeda: string, n: number | null | undefined): string {
  if (n == null) return '—';
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: moeda || 'BRL' });
}
function hora(iso?: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('pt-BR'); } catch { return '—'; }
}

export default function Painel({ k }: { k: string }) {
  const [periodo, setPeriodo] = useState<'7' | '30'>('7');
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [ultimoOkEm, setUltimoOkEm] = useState('');
  const [restante, setRestante] = useState(INTERVALO_S);
  const periodoRef = useRef(periodo);
  periodoRef.current = periodo;

  const buscar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/marketing/dados?k=${encodeURIComponent(k)}&periodo=${periodoRef.current}`, { cache: 'no-store' });
      const j = (await r.json()) as Dados;
      if (j.ok === false) setErro(j.erro || 'falha');
      else { setD(j); setErro(''); setUltimoOkEm(new Date().toISOString()); }
    } catch {
      setErro('sem conexão com o servidor');
    } finally {
      setCarregando(false);
      setRestante(INTERVALO_S);
    }
  }, [k]);

  // primeira carga + troca de período
  useEffect(() => { buscar(); }, [buscar, periodo]);

  // atualização automática
  useEffect(() => {
    const id = setInterval(() => { buscar(); }, INTERVALO_S * 1000);
    return () => clearInterval(id);
  }, [buscar]);

  // contagem regressiva (visual)
  useEffect(() => {
    const id = setInterval(() => setRestante((s) => (s <= 1 ? INTERVALO_S : s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const campanhas = d?.campanhas ?? [];
  const moeda = d?.moeda || 'BRL';
  const falha = !!d?.falhaMeta || (!!erro && !!d);
  const stale = d?.desatualizadoDesde;

  return (
    <>
      <div className="painel-topo">
        <h1>Painel de Anúncios — Meta Ads</h1>
        <div className="status-linha">
          <span className={`conexao ${falha ? 'off' : 'on'}`} />
          <span className="muted">
            {falha ? '⚠️ falha com a Meta — mostrando último dado' : `atualizado às ${hora(ultimoOkEm)}`}
            {' · '}próxima em {restante}s
          </span>
          <button className="btn-atualizar" onClick={() => { setRestante(INTERVALO_S); buscar(); }} disabled={carregando}>
            {carregando ? '…' : '↻ atualizar'}
          </button>
        </div>
      </div>
      <p className="sub">Truckfort / RD Truck · tempo quase real (a Meta pode levar minutos para mudar os números)</p>

      {stale && <p className="aviso-stale">⚠️ Dados de {hora(stale)} — a Meta não respondeu na última tentativa; tentando de novo sozinho.</p>}
      {erro && !d && <p className="erro">Não consegui ler o Meta Ads: {erro}</p>}

      <div className="tabs">
        <a className={periodo === '7' ? 'on' : ''} onClick={() => setPeriodo('7')}>7 dias</a>
        <a className={periodo === '30' ? 'on' : ''} onClick={() => setPeriodo('30')}>30 dias</a>
      </div>

      <div className="cards">
        <div className="card" title="Saldo estimado = limite de gasto − total gasto. O valor exato fica nos dados de pagamento, que a Meta não libera para este acesso (pode variar alguns reais do Gerenciador)."><div className="rotulo">Saldo estimado</div><div className="num">{brl(moeda, d?.saldo)}</div></div>
        <div className="card"><div className="rotulo">Gasto ({periodo} dias)</div><div className="num">{brl(moeda, d?.gasto)}</div></div>
        <div className="card"><div className="rotulo">Leads ({periodo} dias)</div><div className="num ok">{d?.leads ?? '—'}</div></div>
        <div className="card"><div className="rotulo">CPL médio</div><div className="num">{d?.cpl != null ? brl(moeda, d.cpl) : '—'}</div></div>
      </div>

      <div className="bloco">
        <h2>Campanhas ({periodo} dias)</h2>
        {campanhas.length === 0 ? (
          <p className="vazio">{d ? 'Sem dados de campanha no período.' : 'Carregando…'}</p>
        ) : (
          <table>
            <thead>
              <tr><th>Campanha</th><th className="dir">Gasto</th><th className="dir">Leads</th><th className="dir">CPL</th></tr>
            </thead>
            <tbody>
              {campanhas.map((c, i) => {
                const semLead = c.gasto > 0 && c.leads === 0;
                return (
                  <tr key={i}>
                    <td>{c.nome}</td>
                    <td className="dir">{brl(moeda, c.gasto)}</td>
                    <td className={'dir' + (semLead ? ' ruim' : '')}>{c.leads}</td>
                    <td className="dir">{c.cpl != null ? brl(moeda, c.cpl) : (semLead ? <span className="ruim">0 leads</span> : '—')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="muted nota">🔴 em vermelho = gastando sem gerar lead. Atualiza sozinho a cada {INTERVALO_S}s.</p>
      </div>
    </>
  );
}
