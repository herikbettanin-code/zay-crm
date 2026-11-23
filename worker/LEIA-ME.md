# Worker do Executor Técnico da ZAY

Roda **no PC do Herik**. Puxa tarefas do CRM (`/api/exec/worker`) e executa.
Ocioso **não gasta IA** (só poll). Ações críticas (deploy/implantar) exigem **aprovação por token**.

## Como rodar (teste)
1. Copie `worker/.env.example` para `worker/.env` e preencha (segredo do worker, raiz dos projetos).
2. Garanta que o CRM esteja no ar (local ou VPS) com as tabelas `exec_*` aplicadas e os segredos
   `EXEC_ADMIN_SECRET` / `EXEC_WORKER_SECRET` definidos.
3. Rode:
   ```powershell
   node --env-file=worker/.env worker/executor-worker.mjs
   ```

## Segurança embutida
- Só executa nos diretórios da **lista branca** (`EXEC_PROJETOS_AUTORIZADOS`), dentro de `EXEC_PROJETOS_RAIZ`.
- Ação crítica → pede **aprovação por token com validade**; só executa se aprovada.
- Roda como **usuário normal** (sem admin). Não altera os próprios limites (ficam no env do CRM).
- O CRM só aceita tarefas de **origem admin** — mensagens de cliente/externas nunca chegam aqui.

## Ajustes que o Claude local deve validar na máquina
- Flags de permissão do `claude -p` (`EXEC_CLAUDE_ARGS`) conforme a versão instalada.
- Iniciar junto com o Windows (Agendador de Tarefas / atalho na Inicialização).
- Testar os 3 cenários de simulação.
