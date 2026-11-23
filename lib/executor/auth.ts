import { NextRequest } from 'next/server';

// Segurança por SISTEMA, não só por instrução: sem o segredo definido, o acesso é NEGADO (não libera por omissão).
// Dois níveis separados (menor privilégio): o segredo do worker NÃO cria nem aprova tarefas.
function confere(req: NextRequest, envName: string, header: string): boolean {
  const seg = (process.env[envName] ?? '').trim();
  if (!seg) return false; // sem segredo = bloqueado
  return req.nextUrl.searchParams.get('k') === seg || req.headers.get(header) === seg;
}

// Dono (cria tarefa, aprova, cancela, consulta).
export const autorizadoAdmin = (req: NextRequest): boolean => confere(req, 'EXEC_ADMIN_SECRET', 'x-exec-admin');
// Worker local (pega tarefa, reporta progresso, conclui, pede aprovação).
export const autorizadoWorker = (req: NextRequest): boolean => confere(req, 'EXEC_WORKER_SECRET', 'x-exec-worker');
