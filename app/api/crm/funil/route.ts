import { NextResponse } from 'next/server';
import { funil } from '@/lib/crm/repo';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json({ ok: true, funil: await funil() }); }
  catch { return NextResponse.json({ ok: false, erro: 'banco indisponível' }, { status: 500 }); }
}
