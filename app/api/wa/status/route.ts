import { NextResponse } from 'next/server';
import { evoConfig, evoConfigured } from '@/lib/agente/evolution';

export const dynamic = 'force-dynamic';

// Diagnóstico do agente comercial: mostra se o WhatsApp comercial está configurado (sem revelar segredos).
export async function GET() {
  const c = evoConfig();
  return NextResponse.json({
    ok: true,
    comercial_configurado: evoConfigured(),
    instancia: c.instance || null,
    tem_url: !!c.url,
    tem_chave: !!c.key,
    webhook_protegido: !!process.env.WA_WEBHOOK_SECRET,
  });
}
