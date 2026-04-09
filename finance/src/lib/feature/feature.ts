import { CurrencyPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  Despesa,
  Divida,
  FinanceStore,
  Receita,
  ThemeMode,
  ThemeService,
} from '@helpme/data-access';
import { FinanceStatCardComponent, RiskPillComponent } from '@helpme/ui';

@Component({
  selector: 'lib-feature',
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    PercentPipe,
    FinanceStatCardComponent,
    RiskPillComponent,
  ],
  templateUrl: './feature.html',
  styleUrl: './feature.css',
})
export class Feature {
  protected readonly store = inject(FinanceStore);
  protected readonly theme = inject(ThemeService);
  private readonly fb = inject(FormBuilder);

  protected readonly editingReceitaId = signal<string | null>(null);
  protected readonly editingDespesaId = signal<string | null>(null);
  protected readonly editingDividaId = signal<string | null>(null);

  protected readonly receitasOrdenadas = computed(() =>
    [...this.store.receitas()].sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id)),
  );

  protected readonly despesasOrdenadas = computed(() =>
    [...this.store.despesas()].sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id)),
  );

  protected readonly dividasOrdenadas = computed(() =>
    [...this.store.dividas()].sort((a, b) => a.credor.localeCompare(b.credor, 'pt-BR')),
  );

  protected setTheme(mode: ThemeMode): void {
    this.theme.setMode(mode);
  }

  /** Exibe data ISO yyyy-MM-dd como dd/MM/yyyy (sem Date — evita fuso). */
  protected formatarDataIso(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
  }

  private coerceMoneyControl(controlName: string, form: FormGroup): void {
    const ctrl = form.get(controlName);
    const raw = ctrl?.value;
    if (raw === null || raw === undefined || raw === '') {
      return;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return;
    }
    const s = String(raw).trim().replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(s);
    if (Number.isFinite(n)) {
      form.patchValue({ [controlName]: n }, { emitEvent: false });
    }
  }

  protected readonly receitaForm = this.fb.nonNullable.group({
    descricao: ['', [Validators.required]],
    valor: [0, [Validators.required, Validators.min(0.01)]],
    data: [new Date().toISOString().slice(0, 10), [Validators.required]],
  });

  protected readonly despesaForm = this.fb.nonNullable.group({
    descricao: ['', [Validators.required]],
    categoria: ['', [Validators.required]],
    valor: [0, [Validators.required, Validators.min(0.01)]],
    data: [new Date().toISOString().slice(0, 10), [Validators.required]],
    essencial: [true],
  });

  protected readonly dividaForm = this.fb.nonNullable.group({
    credor: ['', [Validators.required]],
    saldoTotal: [0, [Validators.required, Validators.min(1)]],
    parcelaMinima: [0, [Validators.required, Validators.min(1)]],
    jurosMensal: [0, [Validators.required, Validators.min(0)]],
    vencimentoDia: [10, [Validators.required, Validators.min(1), Validators.max(31)]],
  });

  protected salvarReceita(): void {
    this.coerceMoneyControl('valor', this.receitaForm);
    if (this.receitaForm.invalid) {
      this.receitaForm.markAllAsTouched();
      return;
    }
    const raw = this.receitaForm.getRawValue();
    const id = this.editingReceitaId();
    if (id) {
      this.store.updateReceita(id, raw);
      this.editingReceitaId.set(null);
    } else {
      this.store.addReceita(raw);
    }
    this.resetReceitaForm();
  }

  protected salvarDespesa(): void {
    this.coerceMoneyControl('valor', this.despesaForm);
    if (this.despesaForm.invalid) {
      this.despesaForm.markAllAsTouched();
      return;
    }
    const raw = this.despesaForm.getRawValue();
    const id = this.editingDespesaId();
    if (id) {
      this.store.updateDespesa(id, raw);
      this.editingDespesaId.set(null);
    } else {
      this.store.addDespesa(raw);
    }
    this.resetDespesaForm();
  }

  protected salvarDivida(): void {
    this.coerceMoneyControl('saldoTotal', this.dividaForm);
    this.coerceMoneyControl('parcelaMinima', this.dividaForm);
    this.coerceMoneyControl('jurosMensal', this.dividaForm);
    if (this.dividaForm.invalid) {
      this.dividaForm.markAllAsTouched();
      return;
    }
    const raw = this.dividaForm.getRawValue();
    const id = this.editingDividaId();
    if (id) {
      this.store.updateDivida(id, raw);
      this.editingDividaId.set(null);
    } else {
      this.store.addDivida(raw);
    }
    this.resetDividaForm();
  }

  protected editarReceita(item: Receita): void {
    this.cancelarEdicaoDespesa();
    this.cancelarEdicaoDivida();
    this.editingReceitaId.set(item.id);
    this.receitaForm.patchValue({
      descricao: item.descricao,
      valor: item.valor,
      data: item.data,
    });
  }

  protected editarDespesa(item: Despesa): void {
    this.cancelarEdicaoReceita();
    this.cancelarEdicaoDivida();
    this.editingDespesaId.set(item.id);
    this.despesaForm.patchValue({
      descricao: item.descricao,
      categoria: item.categoria,
      valor: item.valor,
      data: item.data,
      essencial: item.essencial,
    });
  }

  protected editarDivida(item: Divida): void {
    this.cancelarEdicaoReceita();
    this.cancelarEdicaoDespesa();
    this.editingDividaId.set(item.id);
    this.dividaForm.patchValue({
      credor: item.credor,
      saldoTotal: item.saldoTotal,
      parcelaMinima: item.parcelaMinima,
      jurosMensal: item.jurosMensal,
      vencimentoDia: item.vencimentoDia,
    });
  }

  protected removerReceita(item: Receita): void {
    if (!confirm(`Remover a receita "${item.descricao}" (${this.formatarDataIso(item.data)})?`)) {
      return;
    }
    if (this.editingReceitaId() === item.id) {
      this.cancelarEdicaoReceita();
    }
    this.store.removeReceita(item.id);
  }

  protected removerDespesa(item: Despesa): void {
    if (!confirm(`Remover a despesa "${item.descricao}" (${this.formatarDataIso(item.data)})?`)) {
      return;
    }
    if (this.editingDespesaId() === item.id) {
      this.cancelarEdicaoDespesa();
    }
    this.store.removeDespesa(item.id);
  }

  protected removerDivida(item: Divida): void {
    if (!confirm(`Remover a dívida com "${item.credor}"?`)) {
      return;
    }
    if (this.editingDividaId() === item.id) {
      this.cancelarEdicaoDivida();
    }
    this.store.removeDivida(item.id);
  }

  protected cancelarEdicaoReceita(): void {
    this.editingReceitaId.set(null);
    this.resetReceitaForm();
  }

  protected cancelarEdicaoDespesa(): void {
    this.editingDespesaId.set(null);
    this.resetDespesaForm();
  }

  protected cancelarEdicaoDivida(): void {
    this.editingDividaId.set(null);
    this.resetDividaForm();
  }

  private resetReceitaForm(): void {
    this.receitaForm.patchValue({
      descricao: '',
      valor: 0,
      data: new Date().toISOString().slice(0, 10),
    });
  }

  private resetDespesaForm(): void {
    this.despesaForm.patchValue({
      descricao: '',
      categoria: '',
      valor: 0,
      data: new Date().toISOString().slice(0, 10),
      essencial: true,
    });
  }

  private resetDividaForm(): void {
    this.dividaForm.patchValue({
      credor: '',
      saldoTotal: 0,
      parcelaMinima: 0,
      jurosMensal: 0,
      vencimentoDia: 10,
    });
  }
}
