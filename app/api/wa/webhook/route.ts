import { NextRequest, NextResponse } from 'next/server';
import { processarWebhookComercial } from '@/lib/agente/comercial';
import type { WaWebhookBody } from '@/lib/agente/webhook';

export const dynamic = 'force-dynamic';

// Webhook do WhatsApp COMERCIAL. A Evolution chama esta URL a cada mensagem recebida.
// Segurança: a URL carrega um segredo (?k=...) que precisa bater com WA_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  const segredo = process.env.WA_WEBHOOK_SECRET?.trim();
  if (segredo) {
    const k = req.nextUrl.searchParams.get('k');
    if (k !== segredo) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
  }

  let body: WaWebhookBody;
  try {
    body = (await req.json()) as WaWebhookBody;
  } catch {
    return NextResponse.json({ ok: true, acao: 'ignorado', motivo: 'corpo inválido' });
  }

  try {
    const r = await processarWebhookComercial(body);
    return NextResponse.json(r);
  } catch (e) {
    console.error('[wa/webhook] erro ao processar:', e);
    // Responde 200 para a Evolution não reenviar em loop; o erro fica registrado no log.
    return NextResponse.json({ ok: false, acao: 'erro', motivo: e instanceof Error ? e.message : 'falha' });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, servico: 'wa/webhook', dica: 'A Evolution deve chamar via POST.' });
}
