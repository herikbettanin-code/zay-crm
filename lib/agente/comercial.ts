// Agente Comercial — recebe a mensagem do WhatsApp comercial, registra o lead (Etapa 2a)
// e RESPONDE o cliente com inteligência (Etapa 2b). Reaproveita 100% a camada do CRM (repo.ts).
// Regras: nunca duplica negócio; a resposta nunca inventa preço/prazo (isso está no prompt).

import {
  acharPorWhatsapp, upsertEmpresa, upsertContato, criarNegocio, registrarInteracao,
  negocioAbertoDoContato, registrarMensagemWa, historicoNegocio,
} from '@/lib/crm/repo';
import { parseEventoWa, type WaWebhookBody, type EventoWa } from './webhook';
import { enviarTexto, evoConfigured } from './evolution';
import { gerarRespostaComercial, type HistItem } from './cerebro';

const MAX_RESUMO = 500;

export interface ResultadoWa {
  ok: boolean;
  acao: 'novo_lead' | 'nova_oportunidade' | 'interacao' | 'ignorado' | 'erro';
  contatoId?: number;
  negocioId?: number;
  respondido?: boolean;
  motivo?: string;
}

function nomeExibicao(evt: EventoWa): string {
  return evt.pushName && evt.pushName.trim() ? evt.pushName.trim() : `WhatsApp ${evt.numero}`;
}

export async function processarWebhookComercial(body: WaWebhookBody): Promise<ResultadoWa> {
  const evt = parseEventoWa(body);
  if (!evt) return { ok: true, acao: 'ignorado', motivo: 'sem mensagem válida' };
  if (evt.fromMe) return { ok: true, acao: 'ignorado', motivo: 'mensagem enviada por nós' };
  if (evt.ehGrupo) return { ok: true, acao: 'ignorado', motivo: 'mensagem de grupo' };
  if (!evt.numero) return { ok: true, acao: 'ignorado', motivo: 'sem número' };
  if (!evt.texto) return { ok: true, acao: 'ignorado', motivo: 'sem texto (mídia sem legenda)' };

  // Idempotência: se já processamos essa mensagem (reenvio do webhook), não faz de novo.
  const nova = await registrarMensagemWa({
    instancia: evt.instancia, remoteJid: evt.remoteJid, messageId: evt.messageId,
    fromMe: evt.fromMe, pushName: evt.pushName, texto: evt.texto,
  });
  if (!nova) return { ok: true, acao: 'ignorado', motivo: 'mensagem repetida' };

  const trecho = evt.texto.length > MAX_RESUMO ? evt.texto.slice(0, MAX_RESUMO) + '…' : evt.texto;
  const nome = evt.pushName && evt.pushName.trim() ? evt.pushName.trim() : undefined;

  // ---------- Etapa 2a: identificar/criar o lead e registrar a mensagem recebida ----------
  let empresaId = 0;
  let contatoId: number;
  let negocioId: number;
  let acao: ResultadoWa['acao'];
  let atendimentoHumano = false;

  const existente = (await acharPorWhatsapp(evt.numero)) as
    | { contato_id: number; empresa_id: number | null }
    | null;

  if (existente?.contato_id) {
    contatoId = existente.contato_id;
    const aberto = await negocioAbertoDoContato(contatoId);
    if (aberto) {
      // Mesma oportunidade em aberto → só registra a nova mensagem (não duplica negócio).
      negocioId = aberto.id;
      empresaId = existente.empresa_id ?? 0;
      atendimentoHumano = aberto.atendimento_humano;
      acao = 'interacao';
      await registrarInteracao({ empresa_id: empresaId || undefined, contato_id: contatoId, negocio_id: negocioId, canal: 'whatsapp', direcao: 'recebida', por: 'cliente', resumo: trecho });
    } else {
      // Contato conhecido, mas sem negócio aberto → nova oportunidade.
      empresaId = existente.empresa_id ?? await upsertEmpresa({ nome_fantasia: nomeExibicao(evt), origem: 'atendimento', whatsapp: evt.numero });
      if (!existente.empresa_id) await upsertContato({ empresa_id: empresaId, whatsapp: evt.numero });
      negocioId = await criarNegocio({ empresa_id: empresaId, contato_id: contatoId, titulo: `Lead WhatsApp — ${nomeExibicao(evt)}`, etapa: 'Novo lead', origem: 'atendimento', criado_por: 'ia' });
      acao = 'nova_oportunidade';
      await registrarInteracao({ empresa_id: empresaId, contato_id: contatoId, negocio_id: negocioId, canal: 'whatsapp', direcao: 'recebida', por: 'cliente', resumo: `Lead recebido pelo WhatsApp comercial (origem não identificada). ${trecho}` });
    }
  } else {
    // Número novo → cria empresa + contato + negócio em "Novo lead".
    empresaId = await upsertEmpresa({ nome_fantasia: nomeExibicao(evt), origem: 'atendimento', whatsapp: evt.numero });
    contatoId = await upsertContato({ empresa_id: empresaId, nome, whatsapp: evt.numero, principal: true });
    negocioId = await criarNegocio({ empresa_id: empresaId, contato_id: contatoId, titulo: `Lead WhatsApp — ${nomeExibicao(evt)}`, etapa: 'Novo lead', origem: 'atendimento', criado_por: 'ia' });
    acao = 'novo_lead';
    await registrarInteracao({ empresa_id: empresaId, contato_id: contatoId, negocio_id: negocioId, canal: 'whatsapp', direcao: 'recebida', por: 'cliente', resumo: `Lead recebido pelo WhatsApp comercial (origem não identificada). ${trecho}` });
  }

  // ---------- Etapa 2b: responder o cliente ----------
  // Só responde se um vendedor NÃO assumiu a conversa e se o WhatsApp comercial está configurado.
  let respondido = false;
  if (!atendimentoHumano && evoConfigured()) {
    try {
      const hist = (await historicoNegocio(negocioId)) as HistItem[];
      const resposta = await gerarRespostaComercial({ nome, mensagem: evt.texto, historico: hist });
      if (resposta) {
        await enviarTexto(evt.numero, resposta);
        await registrarInteracao({ empresa_id: empresaId || undefined, contato_id: contatoId, negocio_id: negocioId, canal: 'whatsapp', direcao: 'enviada', por: 'ia', resumo: resposta });
        respondido = true;
      }
    } catch (e) {
      // Se a resposta falhar, o lead já está salvo. Não quebra o fluxo.
      console.error('[comercial] falha ao responder:', e);
    }
  }

  return { ok: true, acao, contatoId, negocioId, respondido };
}
