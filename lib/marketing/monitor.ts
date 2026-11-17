// Marketing — verificações da conta de anúncios do Meta. Só leitura + comparação com limites.
// Reaproveita o formato de "Problema" da autonomia (tipo, chave, prioridade, descricao).

import { resumoConta, campanhasDesempenho, type ResumoConta } from './meta';

export interface ProblemaMkt {
  tipo: string;
  chave: string;
  prioridade: 'alta' | 'media' | 'baixa';
  descricao: string;
}

const SALDO_MINIMO = Number(process.env.META_SALDO_MINIMO ?? '150'); // avisa quando o saldo pré-pago cair até aqui
const CPL_ALTO = Number(process.env.META_CPL_ALTO ?? '0');           // 0 = desligado; >0 avisa quando o custo por lead passar disso

/** Roda as verificações de marketing. Se o Meta falhar, devolve um único alerta de erro. */
export async function checarMarketing(): Promise<ProblemaMkt[]> {
  const problemas: ProblemaMkt[] = [];

  let conta: ResumoConta;
  try {
    conta = await resumoConta();
  } catch (e) {
    return [{ tipo: 'meta_erro', chave: 'meta_erro', prioridade: 'alta', descricao: `Não consegui ler os anúncios do Meta: ${e instanceof Error ? e.message : 'erro'}` }];
  }

  // 1) Saldo baixo (contas pré-pagas têm "balance"; pós-pagas vêm null e isso é ignorado)
  if (conta.saldo != null && conta.saldo <= SALDO_MINIMO) {
    problemas.push({ tipo: 'saldo_baixo', chave: `saldo_baixo:${Math.floor(conta.saldo)}`, prioridade: 'alta', descricao: `Saldo dos anúncios baixo: ${conta.moeda} ${conta.saldo.toFixed(2)} (mínimo ${SALDO_MINIMO}). Pode pausar as campanhas se zerar.` });
  }

  // 2) Gasto perto do limite da conta (spend_cap)
  if (conta.limite != null && conta.limite > 0 && conta.gasto >= conta.limite * 0.9) {
    problemas.push({ tipo: 'limite_perto', chave: `limite_perto:${Math.floor(conta.gasto)}`, prioridade: 'alta', descricao: `Gasto perto do limite da conta: ${conta.moeda} ${conta.gasto.toFixed(2)} de ${conta.limite.toFixed(2)}.` });
  }

  // 3) Conta desabilitada/em revisão (account_status != 1 = ativa)
  if (conta.status != null && conta.status !== 1) {
    problemas.push({ tipo: 'conta_status', chave: `conta_status:${conta.status}`, prioridade: 'alta', descricao: `Conta de anúncios não está ativa (status ${conta.status}). As campanhas podem estar paradas.` });
  }

  // 4) CPL alto (só se você definir META_CPL_ALTO)
  if (CPL_ALTO > 0) {
    try {
      const camps = await campanhasDesempenho('last_7d');
      for (const c of camps) {
        if (c.cpl != null && c.cpl > CPL_ALTO) {
          problemas.push({ tipo: 'cpl_alto', chave: `cpl_alto:${c.nome}`, prioridade: 'media', descricao: `Custo por lead alto em "${c.nome}": ${conta.moeda} ${c.cpl.toFixed(2)} nos últimos 7 dias.` });
        }
      }
    } catch { /* ignora: o resumo da conta já é o principal */ }
  }

  return problemas;
}
