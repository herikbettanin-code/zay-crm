// Cliente da API de Marketing do Meta (Facebook/Instagram). SÓ LEITURA.
// Lê saldo/gasto da conta, desempenho das campanhas e a Biblioteca de Anúncios (concorrentes).
// Credenciais só por variável de ambiente — nunca no código.

const API = 'https://graph.facebook.com';
const TIMEOUT_MS = 20_000;

function cfg(): { token: string; conta: string; versao: string } {
  return {
    token: process.env.META_TOKEN ?? '',
    conta: process.env.META_AD_ACCOUNT ?? '', // ex.: act_1234567890
    versao: process.env.META_API_VERSION ?? 'v21.0',
  };
}

export function metaConfigurada(): boolean {
  const c = cfg();
  return !!(c.token && c.conta);
}

interface GraphError { error?: { message?: string } }

async function get<T>(pathname: string, params: Record<string, string>): Promise<T> {
  const { token, versao } = cfg();
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/${versao}/${pathname}?${qs}`, { signal: ctl.signal, cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as (T & GraphError) | null;
    if (!res.ok || !data) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

const emReais = (v: unknown): number | null => (v == null || v === '' ? null : Number(v) / 100);

export interface ResumoConta { nome: string; moeda: string; saldo: number | null; gasto: number; limite: number | null; status: number | null }
interface ContaResp { name?: string; currency?: string; balance?: string; amount_spent?: string; spend_cap?: string; account_status?: number }

/** Resumo da conta de anúncios: saldo, gasto e limite (valores já convertidos para a moeda da conta). */
export async function resumoConta(): Promise<ResumoConta> {
  const { conta } = cfg();
  const d = await get<ContaResp>(conta, { fields: 'name,currency,balance,amount_spent,spend_cap,account_status' });
  return {
    nome: d.name ?? '',
    moeda: d.currency ?? 'BRL',
    saldo: emReais(d.balance),              // conta pré-paga: saldo disponível
    gasto: emReais(d.amount_spent) ?? 0,
    limite: emReais(d.spend_cap),           // limite de gasto da conta (0/ausente = sem limite)
    status: d.account_status ?? null,
  };
}

/** Diagnóstico: testa cada campo SEPARADAMENTE e diz se a Meta libera (valor) ou bloqueia (erro).
 *  SÓ LEITURA. Serve pra descobrir qual campo corresponde ao "saldo disponível" e o que o token alcança. */
export async function probarCamposConta(campos: string[]): Promise<Record<string, unknown>> {
  const { conta } = cfg();
  const saida: Record<string, unknown> = {};
  await Promise.all(
    campos.map(async (campo) => {
      try {
        const d = await get<Record<string, unknown>>(conta, { fields: campo });
        saida[campo] = d[campo] ?? null;
      } catch (e) {
        saida[campo] = { bloqueado: e instanceof Error ? e.message : 'falha' };
      }
    }),
  );
  return saida;
}

export interface CampanhaInsight { nome: string; gasto: number; impressoes: number; leads: number; cpl: number | null }
interface AcaoResp { action_type?: string; value?: string }
interface InsightLinha { campaign_name?: string; spend?: string; impressions?: string; actions?: AcaoResp[] }
interface InsightsResp { data?: InsightLinha[] }

function contarLeads(actions: AcaoResp[] | undefined): number {
  if (!actions) return 0;
  // leads por formulário OU conversas iniciadas no WhatsApp (click-to-WhatsApp)
  let max = 0;
  for (const a of actions) {
    if (/lead|leadgen|messaging_conversation_started|messaging_first_reply/i.test(a.action_type ?? '')) {
      max = Math.max(max, Number(a.value ?? 0));
    }
  }
  return max;
}

/** Desempenho por campanha nos últimos N dias (gasto, leads, custo por lead). */
export async function campanhasDesempenho(datePreset = 'last_7d'): Promise<CampanhaInsight[]> {
  const { conta } = cfg();
  const d = await get<InsightsResp>(`${conta}/insights`, {
    level: 'campaign',
    fields: 'campaign_name,spend,impressions,actions',
    date_preset: datePreset,
    limit: '100',
  });
  return (d.data ?? []).map((r) => {
    const gasto = Number(r.spend ?? 0);
    const leads = contarLeads(r.actions);
    return { nome: r.campaign_name ?? '(sem nome)', gasto, impressoes: Number(r.impressions ?? 0), leads, cpl: leads > 0 ? gasto / leads : null };
  });
}

export interface AnuncioConcorrente { pagina: string; texto: string; link: string }
interface ArchiveItem { page_name?: string; ad_creative_bodies?: string[]; ad_snapshot_url?: string }
interface ArchiveResp { data?: ArchiveItem[] }

/** Biblioteca de Anúncios do Meta: anúncios ativos de concorrentes por termo. */
export async function bibliotecaConcorrentes(termo: string, pais = 'BR'): Promise<AnuncioConcorrente[]> {
  const d = await get<ArchiveResp>('ads_archive', {
    search_terms: termo,
    ad_reached_countries: `['${pais}']`,
    ad_active_status: 'ACTIVE',
    ad_type: 'ALL',
    fields: 'page_name,ad_creative_bodies,ad_snapshot_url',
    limit: '25',
  });
  return (d.data ?? []).map((r) => ({
    pagina: r.page_name ?? '',
    texto: (r.ad_creative_bodies ?? []).join(' | ').slice(0, 220),
    link: r.ad_snapshot_url ?? '',
  }));
}
