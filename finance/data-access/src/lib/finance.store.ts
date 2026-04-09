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

/**
 * Compara mês usando o prefixo YYYY-MM da string (ex.: input type="date"),
 * sem passar por Date — evita deslocamento de fuso em "2026-04-01" etc.
 */
function isFromCurrentMonth(dateString: string): boolean {
  const m = /^(\d{4})-(\d{2})/.exec(dateString.trim());
  if (!m) {
    return false;
  }
  return `${m[1]}-${m[2]}` === currentMonthKey();
}

function normalizeMoney(value: unknown): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (value == null || value === '') {
    return Number.NaN;
  }
  const s = String(value).trim().replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : Number.NaN;
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
      .reduce((total, item) => total + normalizeMoney(item.valor), 0),
  );

  readonly totalDespesasMes = computed(() =>
    this.despesasSignal()
      .filter((item) => isFromCurrentMonth(item.data))
      .reduce((total, item) => total + normalizeMoney(item.valor), 0),
  );

  readonly totalEssenciaisMes = computed(() =>
    this.despesasSignal()
      .filter((item) => item.essencial && isFromCurrentMonth(item.data))
      .reduce((total, item) => total + normalizeMoney(item.valor), 0),
  );

  readonly totalParcelaMinima = computed(() =>
    this.dividasSignal().reduce((total, item) => total + normalizeMoney(item.parcelaMinima), 0),
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
    const valor = normalizeMoney(receita.valor);
    if (!Number.isFinite(valor)) {
      return;
    }
    const next = [
      ...this.receitasSignal(),
      { ...receita, valor, id: crypto.randomUUID() },
    ];
    this.receitasSignal.set(next);
    this.persist();
  }

  addDespesa(despesa: Omit<Despesa, 'id'>): void {
    const valor = normalizeMoney(despesa.valor);
    if (!Number.isFinite(valor)) {
      return;
    }
    const next = [
      ...this.despesasSignal(),
      { ...despesa, valor, id: crypto.randomUUID() },
    ];
    this.despesasSignal.set(next);
    this.persist();
  }

  addDivida(divida: Omit<Divida, 'id'>): void {
    const saldoTotal = normalizeMoney(divida.saldoTotal);
    const parcelaMinima = normalizeMoney(divida.parcelaMinima);
    const jurosRaw = normalizeMoney(divida.jurosMensal);
    const jurosMensal = Number.isFinite(jurosRaw) ? jurosRaw : 0;
    if (!Number.isFinite(saldoTotal) || !Number.isFinite(parcelaMinima)) {
      return;
    }
    const next = [
      ...this.dividasSignal(),
      {
        ...divida,
        saldoTotal,
        parcelaMinima,
        jurosMensal,
        id: crypto.randomUUID(),
      },
    ];
    this.dividasSignal.set(next);
    this.persist();
  }

  updateReceita(id: string, receita: Omit<Receita, 'id'>): void {
    const valor = normalizeMoney(receita.valor);
    if (!Number.isFinite(valor)) {
      return;
    }
    const list = this.receitasSignal();
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) {
      return;
    }
    const next = [...list];
    next[idx] = { ...receita, valor, id };
    this.receitasSignal.set(next);
    this.persist();
  }

  updateDespesa(id: string, despesa: Omit<Despesa, 'id'>): void {
    const valor = normalizeMoney(despesa.valor);
    if (!Number.isFinite(valor)) {
      return;
    }
    const list = this.despesasSignal();
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) {
      return;
    }
    const next = [...list];
    next[idx] = { ...despesa, valor, id };
    this.despesasSignal.set(next);
    this.persist();
  }

  updateDivida(id: string, divida: Omit<Divida, 'id'>): void {
    const saldoTotal = normalizeMoney(divida.saldoTotal);
    const parcelaMinima = normalizeMoney(divida.parcelaMinima);
    const jurosRaw = normalizeMoney(divida.jurosMensal);
    const jurosMensal = Number.isFinite(jurosRaw) ? jurosRaw : 0;
    if (!Number.isFinite(saldoTotal) || !Number.isFinite(parcelaMinima)) {
      return;
    }
    const list = this.dividasSignal();
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) {
      return;
    }
    const next = [...list];
    next[idx] = {
      ...divida,
      saldoTotal,
      parcelaMinima,
      jurosMensal,
      id,
    };
    this.dividasSignal.set(next);
    this.persist();
  }

  removeReceita(id: string): void {
    this.receitasSignal.set(this.receitasSignal().filter((item) => item.id !== id));
    this.persist();
  }

  removeDespesa(id: string): void {
    this.despesasSignal.set(this.despesasSignal().filter((item) => item.id !== id));
    this.persist();
  }

  removeDivida(id: string): void {
    this.dividasSignal.set(this.dividasSignal().filter((item) => item.id !== id));
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
