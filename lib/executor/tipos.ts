// Executor técnico — tipos compartilhados entre o CRM (API) e o worker local.

export type StatusTarefa =
  | 'pendente'
  | 'rodando'
  | 'aguardando_aprovacao'
  | 'concluida'
  | 'erro'
  | 'cancelada'
  | 'expirada';

export type TipoTarefa = 'simples' | 'complexa' | 'auto';

export interface Tarefa {
  id: number;
  objetivo: string;
  tipo: TipoTarefa;
  projeto: string | null;
  status: StatusTarefa;
  prioridade: number;
  origem: string;          // sempre 'admin' — comercial/externo nunca entra aqui
  tentativas: number;
  max_tentativas: number;
  timeout_seg: number;
  resultado: string | null;
  erro: string | null;
}

export type StatusAprovacao = 'pendente' | 'aprovada' | 'negada' | 'expirada';

export interface Aprovacao {
  id: number;
  tarefa_id: number;
  acao: string;            // ação crítica descrita (ex.: "implantar em produção")
  token: string;           // código único que o dono confirma
  status: StatusAprovacao;
  valido_ate: string;      // ISO; expira sozinha
}
