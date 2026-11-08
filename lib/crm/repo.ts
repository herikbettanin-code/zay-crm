import { query, one } from '@/lib/db';

// Operações do CRM — testadas no PostgreSQL. É isto que a tela dos vendedores E o agente comercial usam.
// Regras: nunca duplicar (empresa por CNPJ, contato por WhatsApp); histórico por resumo; nada apagado à toa.

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '') || null;

// ---------------- Empresas ----------------
export interface Empresa {
  razao_social?: string; nome_fantasia?: string; cnpj?: string | null; cidade?: string; estado?: string;
  segmento?: string; site?: string; telefone?: string; email?: string; whatsapp?: string;
  tipo_operacao?: string; origem?: string; fonte?: string; fonte_data?: string; observacoes?: string;
}

/** Cadastra ou atualiza a empresa. Se tiver CNPJ, não duplica. */
export async function upsertEmpresa(e: Empresa): Promise<number> {
  const cnpj = digits(e.cnpj);
  if (cnpj) {
    const row = await one<{ id: number }>(
      `INSERT INTO empresas (razao_social, nome_fantasia, cnpj, cidade, estado, segmento, site, telefone, email, whatsapp, tipo_operacao, origem, fonte, fonte_data, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (cnpj) DO UPDATE SET
         razao_social = COALESCE(EXCLUDED.razao_social, empresas.razao_social),
         nome_fantasia = COALESCE(EXCLUDED.nome_fantasia, empresas.nome_fantasia),
         cidade = COALESCE(EXCLUDED.cidade, empresas.cidade),
         estado = COALESCE(EXCLUDED.estado, empresas.estado),
         segmento = COALESCE(EXCLUDED.segmento, empresas.segmento),
         site = COALESCE(EXCLUDED.site, empresas.site),
         telefone = COALESCE(EXCLUDED.telefone, empresas.telefone),
         email = COALESCE(EXCLUDED.email, empresas.email),
         whatsapp = COALESCE(EXCLUDED.whatsapp, empresas.whatsapp),
         tipo_operacao = COALESCE(EXCLUDED.tipo_operacao, empresas.tipo_operacao),
         observacoes = COALESCE(EXCLUDED.observacoes, empresas.observacoes)
       RETURNING id`,
      [e.razao_social ?? null, e.nome_fantasia ?? null, cnpj, e.cidade ?? null, e.estado ?? null, e.segmento ?? null, e.site ?? null, e.telefone ?? null, e.email ?? null, digits(e.whatsapp), e.tipo_operacao ?? null, e.origem ?? null, e.fonte ?? null, e.fonte_data ?? null, e.observacoes ?? null],
    );
    return row!.id;
  }
  const row = await one<{ id: number }>(
    `INSERT INTO empresas (razao_social, nome_fantasia, cidade, estado, segmento, site, telefone, email, whatsapp, tipo_operacao, origem, fonte, fonte_data, observacoes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [e.razao_social ?? null, e.nome_fantasia ?? null, e.cidade ?? null, e.estado ?? null, e.segmento ?? null, e.site ?? null, e.telefone ?? null, e.email ?? null, digits(e.whatsapp), e.tipo_operacao ?? null, e.origem ?? null, e.fonte ?? null, e.fonte_data ?? null, e.observacoes ?? null],
  );
  return row!.id;
}

// ---------------- Contatos ----------------
export interface Contato { empresa_id?: number; nome?: string; cargo?: string; telefone?: string; whatsapp?: string; email?: string; principal?: boolean }

/** Cadastra ou atualiza o contato. Se tiver WhatsApp, não duplica. */
export async function upsertContato(c: Contato): Promise<number> {
  const wa = digits(c.whatsapp);
  if (wa) {
    const row = await one<{ id: number }>(
      `INSERT INTO contatos (empresa_id, nome, cargo, telefone, whatsapp, email, principal)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (whatsapp) WHERE whatsapp IS NOT NULL DO UPDATE SET
         empresa_id = COALESCE(EXCLUDED.empresa_id, contatos.empresa_id),
         nome = COALESCE(EXCLUDED.nome, contatos.nome),
         cargo = COALESCE(EXCLUDED.cargo, contatos.cargo),
         email = COALESCE(EXCLUDED.email, contatos.email)
       RETURNING id`,
      [c.empresa_id ?? null, c.nome ?? null, c.cargo ?? null, digits(c.telefone), wa, c.email ?? null, c.principal ?? false],
    );
    return row!.id;
  }
  const row = await one<{ id: number }>(
    `INSERT INTO contatos (empresa_id, nome, cargo, telefone, email, principal) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [c.empresa_id ?? null, c.nome ?? null, c.cargo ?? null, digits(c.telefone), c.email ?? null, c.principal ?? false],
  );
  return row!.id;
}

/** Acha o lead (contato + empresa) pelo WhatsApp — o agente usa para saber quem está falando. */
export async function acharPorWhatsapp(whatsapp: string) {
  const wa = digits(whatsapp);
  if (!wa) return null;
  return one(
    `SELECT c.id AS contato_id, c.nome AS contato_nome, c.nao_contatar, e.id AS empresa_id, e.nome_fantasia, e.cidade
     FROM contatos c LEFT JOIN empresas e ON e.id = c.empresa_id
     WHERE c.whatsapp = $1 LIMIT 1`, [wa]);
}

// ---------------- Negócios (funil) ----------------
export interface Negocio {
  empresa_id: number; contato_id?: number; titulo: string; etapa?: string; produto_interesse?: string;
  necessidade?: string; cidade?: string; urgencia?: string; valor_estimado?: number; origem?: string;
  vendedor_id?: number; score?: number; score_motivo?: string; proxima_acao?: string; proxima_acao_em?: string;
  criado_por?: 'ia' | 'humano';
}

export async function criarNegocio(n: Negocio): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO negocios (empresa_id, contato_id, titulo, etapa_id, produto_interesse, necessidade, cidade, urgencia, valor_estimado, origem, vendedor_id, score, score_motivo, proxima_acao, proxima_acao_em, criado_por)
     VALUES ($1,$2,$3, COALESCE((SELECT id FROM funil_etapas WHERE lower(nome)=lower($4)), (SELECT id FROM funil_etapas ORDER BY ordem LIMIT 1)), $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [n.empresa_id, n.contato_id ?? null, n.titulo, n.etapa ?? 'Novo lead', n.produto_interesse ?? null, n.necessidade ?? null, n.cidade ?? null, n.urgencia ?? null, n.valor_estimado ?? null, n.origem ?? null, n.vendedor_id ?? null, n.score ?? null, n.score_motivo ?? null, n.proxima_acao ?? null, n.proxima_acao_em ?? null, n.criado_por ?? 'ia'],
  );
  return row!.id;
}

/** Move o negócio para outra etapa do funil (pelo nome da etapa). */
export async function moverEtapa(negocioId: number, etapaNome: string): Promise<void> {
  await query(
    `UPDATE negocios SET etapa_id = (SELECT id FROM funil_etapas WHERE lower(nome)=lower($2)),
       status = CASE WHEN (SELECT ganho FROM funil_etapas WHERE lower(nome)=lower($2)) THEN 'ganho'
                     WHEN (SELECT perdido FROM funil_etapas WHERE lower(nome)=lower($2)) THEN 'perdido'
                     ELSE status END,
       fechado_em = CASE WHEN (SELECT ganho OR perdido FROM funil_etapas WHERE lower(nome)=lower($2)) THEN now() ELSE fechado_em END
     WHERE id = $1`, [negocioId, etapaNome]);
}

/** Define a próxima ação e a data. */
export async function definirProximaAcao(negocioId: number, acao: string, data?: string): Promise<void> {
  await query(`UPDATE negocios SET proxima_acao=$2, proxima_acao_em=$3 WHERE id=$1`, [negocioId, acao, data ?? null]);
}

/** O funil inteiro: por etapa, quantos negócios e qual valor. Para a tela e os relatórios. */
export async function funil() {
  return query(
    `SELECT fe.ordem, fe.nome AS etapa, count(n.id)::int AS quantidade, COALESCE(sum(n.valor_estimado),0) AS valor
     FROM funil_etapas fe LEFT JOIN negocios n ON n.etapa_id = fe.id AND n.status = 'aberto'
     GROUP BY fe.ordem, fe.nome ORDER BY fe.ordem`);
}

/** Negócios parados: abertos com a próxima ação vencida. O agente usa para cobrar follow-up. */
export async function negociosParados() {
  return query(
    `SELECT n.id, n.titulo, e.nome_fantasia, n.proxima_acao, n.proxima_acao_em, n.vendedor_id
     FROM negocios n JOIN empresas e ON e.id = n.empresa_id
     WHERE n.status = 'aberto' AND n.proxima_acao_em IS NOT NULL AND n.proxima_acao_em < CURRENT_DATE
     ORDER BY n.proxima_acao_em`);
}

// ---------------- Atividades e interações ----------------
export async function criarAtividade(a: { negocio_id?: number; empresa_id?: number; tipo: string; descricao?: string; responsavel_id?: number; prazo?: string; criado_por?: 'ia' | 'humano' }): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO atividades (negocio_id, empresa_id, tipo, descricao, responsavel_id, prazo, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (negocio_id, tipo, prazo) WHERE status='pendente' AND negocio_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [a.negocio_id ?? null, a.empresa_id ?? null, a.tipo, a.descricao ?? null, a.responsavel_id ?? null, a.prazo ?? null, a.criado_por ?? 'ia'],
  );
  return row?.id ?? 0; // 0 = já existia uma igual (evita lembrete duplicado)
}

/** Atividades pendentes e vencidas — o agente usa para lembrar/cobrar. */
export async function atividadesVencidas() {
  return query(
    `SELECT a.id, a.tipo, a.descricao, a.prazo, a.negocio_id, a.responsavel_id
     FROM atividades a WHERE a.status = 'pendente' AND a.prazo IS NOT NULL AND a.prazo < now()
     ORDER BY a.prazo`);
}

export async function concluirAtividade(id: number): Promise<void> {
  await query(`UPDATE atividades SET status='feita', concluido_em=now() WHERE id=$1`, [id]);
}

/** Registra um resumo de interação (não a mensagem inteira) no histórico. */
export async function registrarInteracao(i: { empresa_id?: number; contato_id?: number; negocio_id?: number; canal?: string; direcao?: 'recebida' | 'enviada'; por?: 'ia' | 'humano' | 'cliente'; resumo: string }): Promise<void> {
  await query(
    `INSERT INTO interacoes (empresa_id, contato_id, negocio_id, canal, direcao, por, resumo) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [i.empresa_id ?? null, i.contato_id ?? null, i.negocio_id ?? null, i.canal ?? 'whatsapp', i.direcao ?? null, i.por ?? 'ia', i.resumo],
  );
}

/** Histórico de um negócio (para o vendedor pegar tudo mastigado). */
export async function historicoNegocio(negocioId: number) {
  return query(`SELECT por, direcao, canal, resumo, criado_em FROM interacoes WHERE negocio_id=$1 ORDER BY criado_em`, [negocioId]);
}
