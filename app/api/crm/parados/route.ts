import { NextResponse } from 'next/server';
import { negociosParados, atividadesVencidas } from '@/lib/crm/repo';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json({ ok: true, negocios: await negociosParados(), atividades: await atividadesVencidas() }); }
  catch { return NextResponse.json({ ok: false, erro: 'banco indisponível' }, { status: 500 }); }
}
