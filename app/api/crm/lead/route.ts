import { NextRequest, NextResponse } from 'next/server';
import { checarChave } from '@/lib/crm/auth';
import { upsertEmpresa, upsertContato, criarNegocio, registrarInteracao, type Empresa, type Contato, type Negocio } from '@/lib/crm/repo';

// Entrada principal do agente: registra/atualiza um lead (empresa + contato + negócio) sem duplicar.
export async function POST(req: NextRequest) {
  const bloqueio = checarChave(req);
  if (bloqueio) return bloqueio;
  let body: { empresa?: Empresa; contato?: Contato; negocio?: Omit<Negocio, 'empresa_id'>; interacao?: { canal?: string; direcao?: 'recebida' | 'enviada'; por?: 'ia' | 'humano' | 'cliente'; resumo: string } };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erro: 'JSON inválido' }, { status: 400 }); }

  try {
    let empresaId: number | undefined;
    let contatoId: number | undefined;
    let negocioId: number | undefined;

    if (body.empresa) empresaId = await upsertEmpresa(body.empresa);
    if (body.contato) contatoId = await upsertContato({ ...body.contato, empresa_id: body.contato.empresa_id ?? empresaId });
    if (body.negocio && empresaId) negocioId = await criarNegocio({ ...body.negocio, empresa_id: empresaId, contato_id: body.negocio.contato_id ?? contatoId });
    if (body.interacao) await registrarInteracao({ empresa_id: empresaId, contato_id: contatoId, negocio_id: negocioId, ...body.interacao });

    return NextResponse.json({ ok: true, empresaId, contatoId, negocioId });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'falha ao gravar' }, { status: 500 });
  }
}
