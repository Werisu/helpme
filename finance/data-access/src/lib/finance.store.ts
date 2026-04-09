import { computed, Injectable, signal } from '@angular/core';
import {
  AlertaRisco,
  Despesa,
  Divida,
  PrioridadePagamento,
  Receita,
} from './finance.models';

const STORAGE_KEY = 'helpme-finance-mvp-v1';

interface FinanceState {
  receitas: Receita[];
  despesas: Despesa[];
  dividas: Divida[];
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isFromCurrentMonth(dateString: string): boolean {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return key === currentMonthKey();
}

@Injectable({ providedIn: 'root' })
export class FinanceStore {
  private readonly receitasSignal = signal<Receita[]>([]);
  private readonly despesasSignal = signal<Despesa[]>([]);
  private readonly dividasSignal = signal<Divida[]>([]);

  readonly receitas = this.receitasSignal.asReadonly();
  readonly despesas = this.despesasSignal.asReadonly();
  readonly dividas = this.dividasSignal.asReadonly();

  readonly totalReceitasMes = computed(() =>
    this.receitasSignal()
      .filter((item) => isFromCurrentMonth(item.data))
      .reduce((total, item) => total + item.valor, 0),
  );

  readonly totalDespesasMes = computed(() =>
    this.despesasSignal()
      .filter((item) => isFromCurrentMonth(item.data))
      .reduce((total, item) => total + item.valor, 0),
  );

  readonly totalEssenciaisMes = computed(() =>
    this.despesasSignal()
      .filter((item) => item.essencial && isFromCurrentMonth(item.data))
      .reduce((total, item) => total + item.valor, 0),
  );

  readonly totalParcelaMinima = computed(() =>
    this.dividasSignal().reduce((total, item) => total + item.parcelaMinima, 0),
  );

  readonly saldoProjetado = computed(
    () => this.totalReceitasMes() - this.totalDespesasMes() - this.totalParcelaMinima(),
  );

  readonly comprometimentoRenda = computed(() => {
    const renda = this.totalReceitasMes();
    if (renda <= 0) {
      return 1;
    }
    return (this.totalDespesasMes() + this.totalParcelaMinima()) / renda;
  });

  readonly prioridadePagamento = computed<PrioridadePagamento[]>(() => {
    const sobra = Math.max(this.saldoProjetado(), 0);
    const dividasOrdenadas = [...this.dividasSignal()].sort(
      (a, b) => b.jurosMensal - a.jurosMensal,
    );

    return dividasOrdenadas.map((divida, index) => {
      const extra = index === 0 ? sobra : 0;
      return {
        divida,
        valorRecomendado: divida.parcelaMinima + extra,
        motivo:
          index === 0
            ? 'Maior juros do mês (estratégia avalanche).'
            : 'Manter parcela mínima para evitar atraso.',
      };
    });
  });

  readonly alertasRisco = computed<AlertaRisco[]>(() => {
    const alertas: AlertaRisco[] = [];

    if (this.saldoProjetado() < 0) {
      alertas.push({
        tipo: 'critico',
        mensagem:
          'Saldo projetado negativo. Revise despesas variáveis e negocie dívidas imediatamente.',
      });
    }

    if (this.comprometimentoRenda() > 1) {
      alertas.push({
        tipo: 'critico',
        mensagem:
          'Comprometimento acima de 100% da renda. Sem renegociação, a dívida tende a crescer.',
      });
    } else if (this.comprometimentoRenda() > 0.8) {
      alertas.push({
        tipo: 'atencao',
        mensagem:
          'Comprometimento acima de 80%. Qualquer imprevisto pode gerar novo endividamento.',
      });
    }

    const maiorJuros = [...this.dividasSignal()].sort(
      (a, b) => b.jurosMensal - a.jurosMensal,
    )[0];
    if (maiorJuros && maiorJuros.jurosMensal >= 10) {
      alertas.push({
        tipo: 'atencao',
        mensagem: `Dívida com juros muito altos (${maiorJuros.jurosMensal}% a.m.). Priorize esta quitação.`,
      });
    }

    if (!alertas.length) {
      alertas.push({
        tipo: 'info',
        mensagem: 'Situação sob controle no momento. Continue alimentando os dados semanalmente.',
      });
    }

    return alertas;
  });

  constructor() {
    this.restore();
  }

  addReceita(receita: Omit<Receita, 'id'>): void {
    const next = [...this.receitasSignal(), { ...receita, id: crypto.randomUUID() }];
    this.receitasSignal.set(next);
    this.persist();
  }

  addDespesa(despesa: Omit<Despesa, 'id'>): void {
    const next = [...this.despesasSignal(), { ...despesa, id: crypto.randomUUID() }];
    this.despesasSignal.set(next);
    this.persist();
  }

  addDivida(divida: Omit<Divida, 'id'>): void {
    const next = [...this.dividasSignal(), { ...divida, id: crypto.randomUUID() }];
    this.dividasSignal.set(next);
    this.persist();
  }

  private persist(): void {
    const state: FinanceState = {
      receitas: this.receitasSignal(),
      despesas: this.despesasSignal(),
      dividas: this.dividasSignal(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  private restore(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const state = JSON.parse(raw) as Partial<FinanceState>;
      this.receitasSignal.set(state.receitas ?? []);
      this.despesasSignal.set(state.despesas ?? []);
      this.dividasSignal.set(state.dividas ?? []);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}
