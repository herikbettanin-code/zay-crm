// Executor técnico — limites e freios (Fase 1). Tudo por variável de ambiente, com padrões seguros.
// No plano Pro não há cobrança por API; limiteGastoApiUsd só vale se um dia usar chave de API.

export interface LimitesExec {
  maxSimultaneas: number;    // tarefas rodando ao mesmo tempo
  timeoutSegPadrao: number;  // timeout padrão por tarefa (segundos)
  maxTentativas: number;     // tentativas por tarefa antes de marcar erro
  bloquearNovas: boolean;    // kill switch: para de aceitar novas execuções
  limiteGastoApiUsd: number; // 0 = sem cobrança (Pro). >0 = teto quando autenticado por chave de API
}

export function limites(): LimitesExec {
  return {
    maxSimultaneas: Math.max(1, Number(process.env.EXEC_MAX_SIMULTANEAS ?? '1')),
    timeoutSegPadrao: Math.max(30, Number(process.env.EXEC_TIMEOUT_SEG ?? '600')),
    maxTentativas: Math.max(1, Number(process.env.EXEC_MAX_TENTATIVAS ?? '2')),
    bloquearNovas: (process.env.EXEC_BLOQUEAR_NOVAS ?? 'false') === 'true',
    limiteGastoApiUsd: Math.max(0, Number(process.env.EXEC_LIMITE_GASTO_USD ?? '0')),
  };
}

/** Diretórios/projetos que o executor pode tocar (lista branca). Fora disso, recusa. */
export function projetosAutorizados(): string[] {
  const raw = process.env.EXEC_PROJETOS_AUTORIZADOS ?? 'zay-crm,zay-app';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function projetoAutorizado(projeto: string | null | undefined): boolean {
  if (!projeto) return false;
  return projetosAutorizados().includes(projeto.trim());
}
