#!/usr/bin/env node
// Worker do Executor Técnico da ZAY — roda no PC do Herik.
// Puxa tarefas do CRM e executa. Fica OCIOSO sem gastar IA (só poll SQL via HTTP).
// Segurança: só diretórios autorizados (checado aqui, no SO); ações críticas exigem aprovação
// por token; roda como usuário normal (sem admin); NÃO altera seus próprios limites;
// nenhuma mensagem externa chega aqui (o CRM só aceita tarefas de origem 'admin').
//
// Config por variável de ambiente (use um worker/.env e rode:  node --env-file=worker/.env worker/executor-worker.mjs)

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import fs from 'node:fs';

const CFG = {
  base: (process.env.EXEC_CRM_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  workerSecret: process.env.EXEC_WORKER_SECRET || '',
  raiz: process.env.EXEC_PROJETOS_RAIZ || '',                 // ex.: C:\Users\herik\Documents\Zay
  autorizados: (process.env.EXEC_PROJETOS_AUTORIZADOS || 'zay-crm,zay-app').split(',').map((s) => s.trim()).filter(Boolean),
  pollMs: Number(process.env.EXEC_POLL_MS || 5000),
  claudeCmd: process.env.EXEC_CLAUDE_CMD || 'claude',
  claudeArgs: (process.env.EXEC_CLAUDE_ARGS || '-p --permission-mode acceptEdits').split(' ').filter(Boolean),
  timeoutSegPadrao: Number(process.env.EXEC_TIMEOUT_SEG || 600),
};

if (!CFG.workerSecret) { console.error('EXEC_WORKER_SECRET não definido — abortando.'); process.exit(1); }

const H = { 'x-exec-worker': CFG.workerSecret, 'content-type': 'application/json' };
const api = (p) => `${CFG.base}/api/exec/worker${p}`;

async function getJson(url) { const r = await fetch(url, { headers: H }); return r.json().catch(() => null); }
async function postJson(url, body) { const r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) }); return r.json().catch(() => null); }

const progresso = (id, msg, nivel = 'info') => postJson(api('?acao=progresso'), { tarefa_id: id, mensagem: msg, nivel }).catch(() => null);
const concluir = (id, status, texto) => postJson(api('?acao=concluir'), { tarefa_id: id, status, texto }).catch(() => null);

// Resolve e valida o diretório do projeto (lista branca + precisa existir dentro da raiz).
function dirProjeto(projeto) {
  if (!projeto || !CFG.autorizados.includes(projeto)) return null;
  const dir = path.resolve(CFG.raiz, projeto);
  const raizAbs = path.resolve(CFG.raiz);
  if (!dir.startsWith(raizAbs)) return null;          // nunca sai da raiz autorizada
  if (!fs.existsSync(dir)) return null;
  return dir;
}

function ehCritica(t) {
  if (t.tipo === 'critica') return true;
  return /\b(deploy|implantar|publicar|produç|produc)/i.test(t.objetivo || '');
}

// Roda o Claude Code de forma não-interativa no diretório do projeto, com timeout.
function rodarClaude(objetivo, cwd, timeoutSeg, onLinha) {
  return new Promise((resolve) => {
    const proc = spawn(CFG.claudeCmd, [...CFG.claudeArgs, objetivo], { cwd, shell: true });
    let saida = '';
    const timer = setTimeout(() => { proc.kill(); resolve({ ok: false, saida: saida + '\n[timeout]' }); }, timeoutSeg * 1000);
    proc.stdout.on('data', (d) => { const s = d.toString(); saida += s; onLinha?.(s); });
    proc.stderr.on('data', (d) => { saida += d.toString(); });
    proc.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, saida: saida.slice(-4000) }); });
    proc.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, saida: `erro ao iniciar claude: ${e.message}` }); });
  });
}

async function executar(t) {
  const dir = dirProjeto(t.projeto);
  if (!dir) { await concluir(t.id, 'erro', `projeto não autorizado ou inexistente: ${t.projeto}`); return; }

  // Ação crítica → precisa de aprovação por token (vinculada à tarefa, com validade).
  if (ehCritica(t)) {
    const ap = (await getJson(api(`?acao=aprovacao-status&tarefa_id=${t.id}`)))?.aprovacao;
    const aprovada = ap && ap.status === 'aprovada' && new Date(ap.valido_ate) > new Date();
    if (!aprovada) {
      const r = await postJson(api('?acao=aprovacao'), { tarefa_id: t.id, acao_descricao: `executar: ${t.objetivo}`, minutos: 30 });
      await progresso(t.id, `⏸️ Ação crítica — aguardando sua aprovação. Token: ${r?.token} (válido até ${r?.valido_ate}).`, 'aviso');
      return; // a tarefa fica 'aguardando_aprovacao'; quando você aprovar, ela volta e o worker retoma
    }
    await progresso(t.id, '✅ Aprovação confirmada — executando a ação crítica.');
  }

  await progresso(t.id, `▶️ Iniciando em ${t.projeto}: ${t.objetivo}`);
  const hb = setInterval(() => progresso(t.id, '… em andamento'), 30000);
  const res = await rodarClaude(t.objetivo, dir, t.timeout_seg || CFG.timeoutSegPadrao, (s) => {
    const linha = s.trim(); if (linha) progresso(t.id, linha.slice(0, 500));
  });
  clearInterval(hb);

  if (res.ok) await concluir(t.id, 'concluida', res.saida || 'concluído');
  else if ((t.tentativas || 0) < (t.max_tentativas || 2)) await progresso(t.id, `⚠️ Falhou (tentativa ${t.tentativas}). Vou tentar de novo.`, 'erro');
  else await concluir(t.id, 'erro', res.saida || 'falhou após as tentativas');
}

async function loop() {
  console.log(`[worker] ligado. CRM=${CFG.base} raiz=${CFG.raiz} projetos=${CFG.autorizados.join(',')}`);
  for (;;) {
    try {
      const r = await getJson(api(''));
      const t = r?.tarefa;
      if (t) { console.log(`[worker] tarefa #${t.id}: ${t.objetivo}`); await executar(t); }
      else await sleep(CFG.pollMs);   // ocioso: só espera, sem gastar IA
    } catch (e) {
      console.error('[worker] erro no ciclo:', e.message); await sleep(CFG.pollMs);
    }
  }
}

loop();
