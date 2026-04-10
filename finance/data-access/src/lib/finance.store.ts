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
 * Verifica se a data (yyyy-MM-dd) pertence ao mês de referência yyyy-MM.
 */
function dataNoMesReferencia(dateString: string, mesReferencia: string): boolean {
  const m = /^(\d{4})-(\d{2})/.exec(dateString.trim());
  if (!m) {
    return false;
  }
  return `${m[1]}-${m[2]}` === mesReferencia;
}

function shiftMonth(ym: string, delta: number): string {
  const parts = ym.split('-').map(Number);
  const y = parts[0];
  const mo = parts[1];
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

function csvRow(values: (string | number | boolean)[]): string {
  return values
    .map((v) => {
      const s = String(v ?? '');
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(',');
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.click();
  URL.revokeObjectURL(url);
}

function mapReceitaImport(x: unknown): Receita | null {
  if (!x || typeof x !== 'object') {
    return null;
  }
  const r = x as Record<string, unknown>;
  const valor = normalizeMoney(r['valor']);
  if (!Number.isFinite(valor) || valor <= 0) {
    return null;
  }
  const descricao = String(r['descricao'] ?? '').trim();
  const data = String(r['data'] ?? '').trim();
  if (!descricao || !data) {
    return null;
  }
  const rid = r['id'];
  const id = typeof rid === 'string' && rid.length > 0 ? rid : crypto.randomUUID();
  return { id, descricao, valor, data };
}

function mapDespesaImport(x: unknown): Despesa | null {
  if (!x || typeof x !== 'object') {
    return null;
  }
  const r = x as Record<string, unknown>;
  const valor = normalizeMoney(r['valor']);
  if (!Number.isFinite(valor) || valor <= 0) {
    return null;
  }
  const descricao = String(r['descricao'] ?? '').trim();
  const categoria = String(r['categoria'] ?? '').trim();
  const data = String(r['data'] ?? '').trim();
  if (!descricao || !categoria || !data) {
    return null;
  }
  const ess =
    r['essencial'] === true ||
    r['essencial'] === 'true' ||
    r['essencial'] === 'sim' ||
    r['essencial'] === 1;
  const essencial = Boolean(ess);
  const rid = r['id'];
  const id = typeof rid === 'string' && rid.length > 0 ? rid : crypto.randomUUID();
  return { id, descricao, categoria, valor, data, essencial };
}

function mapDividaImport(x: unknown): Divida | null {
  if (!x || typeof x !== 'object') {
    return null;
  }
  const r = x as Record<string, unknown>;
  const saldoTotal = normalizeMoney(r['saldoTotal']);
  const parcelaMinima = normalizeMoney(r['parcelaMinima']);
  if (!Number.isFinite(saldoTotal) || !Number.isFinite(parcelaMinima)) {
    return null;
  }
  const credor = String(r['credor'] ?? '').trim();
  if (!credor) {
    return null;
  }
  const jurosRaw = normalizeMoney(r['jurosMensal']);
  const jurosMensal = Number.isFinite(jurosRaw) ? jurosRaw : 0;
  const vd = Number(r['vencimentoDia']);
  const vencimentoDia =
    Number.isFinite(vd) && vd >= 1 && vd <= 31 ? Math.round(vd) : 10;
  const rid = r['id'];
  const id = typeof rid === 'string' && rid.length > 0 ? rid : crypto.randomUUID();
  return { id, credor, saldoTotal, parcelaMinima, jurosMensal, vencimentoDia };
}

export type FinanceBackupParseResult =
  | { ok: true; state: FinanceState }
  | { ok: false; error: string };

export type FinanceDividasJsonParseResult =
  | { ok: true; dividas: Divida[] }
  | { ok: false; error: string };

function extractDividasArrayFromParsed(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const root = parsed as Record<string, unknown>;
  const dataNode = root['data'];
  const inner =
    dataNode && typeof dataNode === 'object'
      ? (dataNode as Record<string, unknown>)
      : root;
  const dividasRaw = inner['dividas'];
  return Array.isArray(dividasRaw) ? dividasRaw : null;
}

@Injectable({ providedIn: 'root' })
export class FinanceStore {
  private readonly receitasSignal = signal<Receita[]>([]);
  private readonly despesasSignal = signal<Despesa[]>([]);
  private readonly dividasSignal = signal<Divida[]>([]);
  /** yyyy-MM — mês exibido nos resumos, alertas e listas de receitas/despesas */
  private readonly mesReferenciaSignal = signal<string>(currentMonthKey());

  readonly receitas = this.receitasSignal.asReadonly();
  readonly despesas = this.despesasSignal.asReadonly();
  readonly dividas = this.dividasSignal.asReadonly();
  readonly mesReferencia = this.mesReferenciaSignal.asReadonly();

  readonly mesReferenciaEhMesAtual = computed(
    () => this.mesReferenciaSignal() === currentMonthKey(),
  );

  readonly mesReferenciaLegivel = computed(() => {
    const ym = this.mesReferenciaSignal();
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  });

  readonly totalReceitasMes = computed(() => {
    const mes = this.mesReferenciaSignal();
    return this.receitasSignal()
      .filter((item) => dataNoMesReferencia(item.data, mes))
      .reduce((total, item) => total + normalizeMoney(item.valor), 0);
  });

  readonly totalDespesasMes = computed(() => {
    const mes = this.mesReferenciaSignal();
    return this.despesasSignal()
      .filter((item) => dataNoMesReferencia(item.data, mes))
      .reduce((total, item) => total + normalizeMoney(item.valor), 0);
  });

  readonly totalEssenciaisMes = computed(() => {
    const mes = this.mesReferenciaSignal();
    return this.despesasSignal()
      .filter((item) => item.essencial && dataNoMesReferencia(item.data, mes))
      .reduce((total, item) => total + normalizeMoney(item.valor), 0);
  });

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

    if (!this.mesReferenciaEhMesAtual()) {
      alertas.push({
        tipo: 'info',
        mensagem: `Resumo de ${this.mesReferenciaLegivel()}. Parcelas mínimas e dívidas usam o cadastro atual (não são históricas por mês).`,
      });
    }

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

  setMesReferencia(ym: string): void {
    const trimmed = ym.trim();
    if (!/^\d{4}-\d{2}$/.test(trimmed)) {
      return;
    }
    const monthNum = Number(trimmed.slice(5, 7));
    if (monthNum < 1 || monthNum > 12) {
      return;
    }
    this.mesReferenciaSignal.set(trimmed);
  }

  mesAnterior(): void {
    this.mesReferenciaSignal.update((ym) => shiftMonth(ym, -1));
  }

  mesSeguinte(): void {
    this.mesReferenciaSignal.update((ym) => shiftMonth(ym, 1));
  }

  irParaMesAtual(): void {
    this.mesReferenciaSignal.set(currentMonthKey());
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

  removeDividas(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }
    const idSet = new Set(ids);
    this.dividasSignal.set(this.dividasSignal().filter((item) => !idSet.has(item.id)));
    this.persist();
  }

  /** Backup completo (mesmo conteúdo persistido + metadados). */
  downloadJsonBackup(): void {
    const exportedAt = new Date().toISOString();
    const payload = {
      version: 1,
      exportedAt,
      receitas: this.receitasSignal(),
      despesas: this.despesasSignal(),
      dividas: this.dividasSignal(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const day = exportedAt.slice(0, 10);
    triggerBrowserDownload(blob, `helpme-finance-backup-${day}.json`);
  }

  downloadCsvReceitas(): void {
    const lines = [
      csvRow(['id', 'descricao', 'valor', 'data']),
      ...this.receitasSignal().map((r) => csvRow([r.id, r.descricao, r.valor, r.data])),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    triggerBrowserDownload(blob, 'helpme-receitas.csv');
  }

  downloadCsvDespesas(): void {
    const lines = [
      csvRow(['id', 'descricao', 'categoria', 'valor', 'data', 'essencial']),
      ...this.despesasSignal().map((d) =>
        csvRow([d.id, d.descricao, d.categoria, d.valor, d.data, d.essencial ? 'sim' : 'nao']),
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    triggerBrowserDownload(blob, 'helpme-despesas.csv');
  }

  downloadCsvDividas(): void {
    const lines = [
      csvRow(['id', 'credor', 'saldoTotal', 'parcelaMinima', 'jurosMensal', 'vencimentoDia']),
      ...this.dividasSignal().map((div) =>
        csvRow([
          div.id,
          div.credor,
          div.saldoTotal,
          div.parcelaMinima,
          div.jurosMensal,
          div.vencimentoDia,
        ]),
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    triggerBrowserDownload(blob, 'helpme-dividas.csv');
  }

  /**
   * Aceita backup exportado pelo app (`version` + arrays) ou o JSON cru do localStorage.
   */
  parseBackupJson(text: string): FinanceBackupParseResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'O arquivo não é um JSON válido.' };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Formato inválido.' };
    }
    const root = parsed as Record<string, unknown>;
    const dataNode = root['data'];
    const inner =
      dataNode && typeof dataNode === 'object'
        ? (dataNode as Record<string, unknown>)
        : root;
    const receitasRaw = inner['receitas'];
    const despesasRaw = inner['despesas'];
    const dividasRaw = inner['dividas'];
    if (!Array.isArray(receitasRaw) || !Array.isArray(despesasRaw) || !Array.isArray(dividasRaw)) {
      return {
        ok: false,
        error: 'O JSON precisa conter os arrays receitas, despesas e dívidas.',
      };
    }
    const receitas = receitasRaw.map(mapReceitaImport).filter((x): x is Receita => x !== null);
    const despesas = despesasRaw.map(mapDespesaImport).filter((x): x is Despesa => x !== null);
    const dividas = dividasRaw.map(mapDividaImport).filter((x): x is Divida => x !== null);
    return {
      ok: true,
      state: { receitas, despesas, dividas },
    };
  }

  /** Substitui dados locais e persiste (use após confirmar com o usuário). */
  applyImportedState(state: FinanceState): void {
    this.receitasSignal.set(state.receitas);
    this.despesasSignal.set(state.despesas);
    this.dividasSignal.set(state.dividas);
    this.persist();
  }

  /**
   * JSON só com dívidas: array `[{...}]` ou `{ "dividas": [...] }` (também vale um backup
   * completo — apenas o array `dividas` é lido). Mesmos campos de `mapDividaImport`.
   */
  parseDividasJson(text: string): FinanceDividasJsonParseResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'O arquivo não é um JSON válido.' };
    }
    const dividasRaw = extractDividasArrayFromParsed(parsed);
    if (dividasRaw === null) {
      return {
        ok: false,
        error:
          'Use um array de objetos ou um objeto com a propriedade "dividas" (array).',
      };
    }
    const dividas = dividasRaw.map(mapDividaImport).filter((x): x is Divida => x !== null);
    if (dividasRaw.length > 0 && dividas.length === 0) {
      return {
        ok: false,
        error: 'Nenhuma dívida válida: credor, saldoTotal e parcelaMinima são obrigatórios.',
      };
    }
    return { ok: true, dividas };
  }

  /** Anexa dívidas importadas. Se o `id` já existir, gera outro para não sobrescrever. */
  mergeImportedDividas(novas: Divida[]): void {
    if (novas.length === 0) {
      return;
    }
    const existing = this.dividasSignal();
    const idSet = new Set(existing.map((d) => d.id));
    const merged = [...existing];
    for (const d of novas) {
      let id = d.id;
      if (idSet.has(id)) {
        id = crypto.randomUUID();
      }
      idSet.add(id);
      merged.push({ ...d, id });
    }
    this.dividasSignal.set(merged);
    this.persist();
  }

  /** Substitui apenas a lista de dívidas (receitas e despesas inalteradas). */
  replaceDividasImport(novas: Divida[]): void {
    this.dividasSignal.set(novas);
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
