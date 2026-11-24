import Painel from './painel';

// Painel de Anúncios (Meta Ads) — SÓ LEITURA. Protegido por senha no link (?k=...).
// A página só confere a senha e entrega o painel que atualiza sozinho (componente cliente).
export const dynamic = 'force-dynamic';

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

  return <Painel k={k} />;
}
