import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Health check simples: confirma que a aplicação está no ar. Só leitura, sem efeito colateral.
export function GET() {
  return NextResponse.json({ ok: true, servico: 'crm-web', hora: new Date().toISOString() });
}
