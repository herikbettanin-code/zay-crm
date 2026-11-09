-- =====================================================================
-- CRM Truckfort — modelo de dados (PostgreSQL)
-- Base do Agente Comercial da ZAY. Rode este arquivo UMA vez no banco novo.
-- Pode rodar de novo com segurança: usa "IF NOT EXISTS" e não apaga nada.
-- =====================================================================

-- Atualiza automaticamente a coluna atualizado_em quando a linha muda.
CREATE OR REPLACE FUNCTION set_atualizado_em() RETURNS trigger AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Vendedores (e usuários do CRM). A senha fica como hash, nunca em texto.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendedores (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          TEXT NOT NULL,
  email         TEXT UNIQUE,
  telefone      TEXT,
  papel         TEXT NOT NULL DEFAULT 'vendedor',   -- vendedor | gerente | admin
  senha_hash    TEXT,                                -- definido depois, no login do CRM
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Instâncias de WhatsApp (vários números, cada um com suas regras). Doc §9.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_instancias (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          TEXT NOT NULL UNIQUE,         -- nome da instância no Evolution
  numero        TEXT,                         -- número conectado (só dígitos)
  rotulo        TEXT,                          -- "Comercial Truckfort", "Henrique"
  modo          TEXT NOT NULL DEFAULT 'assistido', -- automatico | assistido | desligado
  responsavel_id BIGINT REFERENCES vendedores(id) ON DELETE SET NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Empresas (clientes e prospects). Dedup por CNPJ quando houver.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  razao_social  TEXT,
  nome_fantasia TEXT,
  cnpj          TEXT UNIQUE,                   -- NULL quando não se sabe
  cidade        TEXT,
  estado        TEXT,
  segmento      TEXT,                           -- transportadora, logística, indústria...
  site          TEXT,
  telefone      TEXT,
  email         TEXT,
  whatsapp      TEXT,
  tipo_operacao TEXT,
  origem        TEXT,                           -- prospeccao | atendimento | reativacao | trafego_pago
  fonte         TEXT,                           -- de onde veio a informação
  fonte_data    DATE,                           -- quando a informação foi coletada
  observacoes   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_empresas_nome ON empresas (lower(nome_fantasia));
CREATE INDEX IF NOT EXISTS idx_empresas_cidade ON empresas (lower(cidade));

-- ---------------------------------------------------------------------
-- Contatos (pessoas dentro das empresas).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contatos (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id    BIGINT REFERENCES empresas(id) ON DELETE CASCADE,
  nome          TEXT,
  cargo         TEXT,
  telefone      TEXT,
  whatsapp      TEXT,                           -- só dígitos; chave de identificação do lead
  email         TEXT,
  principal     BOOLEAN NOT NULL DEFAULT FALSE,
  nao_contatar  BOOLEAN NOT NULL DEFAULT FALSE, -- descadastramento / opt-out
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contato_whatsapp ON contatos (whatsapp) WHERE whatsapp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contatos_empresa ON contatos (empresa_id);

-- ---------------------------------------------------------------------
-- Etapas do funil (editáveis pelos vendedores). Semeadas mais abaixo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS funil_etapas (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome     TEXT NOT NULL UNIQUE,
  ordem    INT NOT NULL,
  ganho    BOOLEAN NOT NULL DEFAULT FALSE,   -- etapa que representa venda fechada
  perdido  BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------
-- Negócios / oportunidades (o coração do funil).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS negocios (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      BIGINT REFERENCES empresas(id) ON DELETE CASCADE,
  contato_id      BIGINT REFERENCES contatos(id) ON DELETE SET NULL,
  titulo          TEXT NOT NULL,
  etapa_id        BIGINT REFERENCES funil_etapas(id) ON DELETE SET NULL,
  produto_interesse TEXT,                      -- carreta Sider, baú alumínio, lona, peças...
  necessidade     TEXT,
  cidade          TEXT,
  urgencia        TEXT,                         -- baixa | media | alta
  valor_estimado  NUMERIC(14,2),
  status          TEXT NOT NULL DEFAULT 'aberto', -- aberto | ganho | perdido
  origem          TEXT,                         -- prospeccao | atendimento | reativacao | trafego_pago
  vendedor_id     BIGINT REFERENCES vendedores(id) ON DELETE SET NULL,
  score           INT,                          -- 0 a 100
  score_motivo    TEXT,                         -- por que esse score (explicável)
  proxima_acao    TEXT,
  proxima_acao_em DATE,
  criado_por      TEXT NOT NULL DEFAULT 'ia',   -- ia | humano
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  fechado_em      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_negocios_empresa ON negocios (empresa_id);
CREATE INDEX IF NOT EXISTS idx_negocios_status ON negocios (status);
CREATE INDEX IF NOT EXISTS idx_negocios_vendedor ON negocios (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_negocios_proxima ON negocios (proxima_acao_em);

-- ---------------------------------------------------------------------
-- Atividades / tarefas (retornar, enviar orçamento, confirmar medidas...).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atividades (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  negocio_id    BIGINT REFERENCES negocios(id) ON DELETE CASCADE,
  empresa_id    BIGINT REFERENCES empresas(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,                  -- retornar | enviar_orcamento | confirmar_medidas | ...
  descricao     TEXT,
  responsavel_id BIGINT REFERENCES vendedores(id) ON DELETE SET NULL,
  prazo         TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'pendente', -- pendente | feita | cancelada
  criado_por    TEXT NOT NULL DEFAULT 'ia',     -- ia | humano
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_atividades_negocio ON atividades (negocio_id);
CREATE INDEX IF NOT EXISTS idx_atividades_status ON atividades (status, prazo);
-- evita lembrete duplicado: mesma tarefa, mesmo negócio, mesmo prazo
CREATE UNIQUE INDEX IF NOT EXISTS uq_atividade_dedup ON atividades (negocio_id, tipo, prazo)
  WHERE status = 'pendente' AND negocio_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Interações (histórico comercial: resumos, não cada mensagem).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interacoes (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id  BIGINT REFERENCES empresas(id) ON DELETE CASCADE,
  contato_id  BIGINT REFERENCES contatos(id) ON DELETE SET NULL,
  negocio_id  BIGINT REFERENCES negocios(id) ON DELETE SET NULL,
  canal       TEXT,                              -- whatsapp | email | telefone | site
  direcao     TEXT,                              -- recebida | enviada
  por         TEXT NOT NULL DEFAULT 'ia',         -- ia | humano | cliente
  resumo      TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interacoes_empresa ON interacoes (empresa_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_interacoes_negocio ON interacoes (negocio_id, criado_em);

-- ---------------------------------------------------------------------
-- Registro de sincronização / pendências (tentar de novo sem perder lead). Doc §7.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_pendencias (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo        TEXT NOT NULL,                     -- o que precisa ser feito
  payload     JSONB,                             -- dados para refazer a operação
  tentativas  INT NOT NULL DEFAULT 0,
  ultimo_erro TEXT,
  resolvido   BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Gatilhos de atualizado_em
-- ---------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['vendedores','empresas','contatos','negocios']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_upd ON %I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_upd BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Etapas padrão do funil (só insere se ainda não existirem)
-- ---------------------------------------------------------------------
INSERT INTO funil_etapas (nome, ordem, ganho, perdido) VALUES
  ('Prospecção',       1, FALSE, FALSE),
  ('Novo lead',        2, FALSE, FALSE),
  ('Qualificando',     3, FALSE, FALSE),
  ('Qualificado',      4, FALSE, FALSE),
  ('Proposta enviada', 5, FALSE, FALSE),
  ('Negociação',       6, FALSE, FALSE),
  ('Ganho',            7, TRUE,  FALSE),
  ('Perdido',          8, FALSE, TRUE)
ON CONFLICT (nome) DO NOTHING;

-- ---------------------------------------------------------------------
-- Mensagens de WhatsApp recebidas (idempotência do webhook + auditoria). Doc §9.
-- Guarda só o necessário para não processar a mesma mensagem duas vezes.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_mensagens (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  instancia    TEXT,
  remote_jid   TEXT,
  message_id   TEXT UNIQUE,                 -- id da mensagem no WhatsApp; evita processar 2x
  from_me      BOOLEAN NOT NULL DEFAULT FALSE,
  push_name    TEXT,
  texto        TEXT,
  recebido_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_mensagens_jid ON wa_mensagens (remote_jid, recebido_em);

-- Marca que um negócio está sendo atendido por humano (a IA para de responder). Doc §4.
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS atendimento_humano BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------
-- Autonomia (Etapa 1): registra alertas já enviados para não repetir.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS autonomia_alertas (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave      TEXT NOT NULL,
  tipo       TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_autonomia_alertas_chave ON autonomia_alertas (chave, criado_em);
