// Traduz o evento que a Evolution envia no webhook (messages.upsert) para um formato simples.
// Não confia em nada: trata campos ausentes e formatos diferentes sem quebrar.

export interface WaKey { remoteJid?: string; fromMe?: boolean; id?: string }
export interface WaMessageContent {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string };
  videoMessage?: { caption?: string };
  documentMessage?: { caption?: string };
}
export interface WaData {
  key?: WaKey;
  message?: WaMessageContent;
  pushName?: string;
  instance?: string;
}
export interface WaWebhookBody {
  event?: string;
  instance?: string;
  data?: WaData | WaData[];
}

export interface EventoWa {
  instancia: string;
  remoteJid: string;
  numero: string;
  messageId: string;
  fromMe: boolean;
  pushName: string;
  texto: string;
  ehGrupo: boolean;
}

function textoDaMensagem(message: WaMessageContent | undefined): string {
  if (!message) return '';
  if (typeof message.conversation === 'string') return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  return '';
}

export function parseEventoWa(body: WaWebhookBody | null | undefined): EventoWa | null {
  if (!body) return null;
  const data: WaData | undefined = Array.isArray(body.data) ? body.data[0] : body.data;
  const key = data?.key;
  if (!key?.remoteJid) return null;
  const remoteJid = key.remoteJid;
  const numero = remoteJid.split('@')[0].replace(/\D/g, '');
  return {
    instancia: body.instance ?? data?.instance ?? '',
    remoteJid,
    numero,
    messageId: key.id ?? '',
    fromMe: !!key.fromMe,
    pushName: data?.pushName ?? '',
    texto: textoDaMensagem(data?.message).trim(),
    ehGrupo: remoteJid.endsWith('@g.us'),
  };
}
