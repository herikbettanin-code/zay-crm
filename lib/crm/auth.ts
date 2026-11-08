import { NextRequest, NextResponse } from 'next/server';

// Proteção simples da API do agente: se CRM_API_KEY estiver definida, exige o cabeçalho x-crm-key igual.
// Em modo local (sem a chave definida), libera para facilitar os testes. No VPS, sempre defina a chave.
export function checarChave(req: NextRequest): NextResponse | null {
  const esperada = process.env.CRM_API_KEY?.trim();
  if (!esperada) return null; // dev: liberado
  if (req.headers.get('x-crm-key') === esperada) return null;
  return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 });
}
