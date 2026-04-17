export interface Receita {
  id: string;
  descricao: string;
  valor: number;
  data: string;
}

export interface Despesa {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  essencial: boolean;
  /** Já quitada no mês (não entra em “a pagar” / saldo projetado). */
  paga: boolean;
}

export interface Divida {
  id: string;
  credor: string;
  saldoTotal: number;
  parcelaMinima: number;
  jurosMensal: number;
  vencimentoDia: number;
}

export interface AlertaRisco {
  tipo: 'critico' | 'atencao' | 'info';
  mensagem: string;
}

export interface PrioridadePagamento {
  divida: Divida;
  valorRecomendado: number;
  motivo: string;
}
