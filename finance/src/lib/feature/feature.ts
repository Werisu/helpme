import { CurrencyPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import Swal from 'sweetalert2';
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

  protected readonly receitasOrdenadas = computed(() => {
    const mes = this.store.mesReferencia();
    return [...this.store.receitas()]
      .filter((r) => r.data.slice(0, 7) === mes)
      .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
  });

  protected readonly despesasOrdenadas = computed(() => {
    const mes = this.store.mesReferencia();
    return [...this.store.despesas()]
      .filter((d) => d.data.slice(0, 7) === mes)
      .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
  });

  protected readonly dividasOrdenadas = computed(() =>
    [...this.store.dividas()].sort((a, b) => a.credor.localeCompare(b.credor, 'pt-BR')),
  );

  /** IDs marcados na tabela de despesas para exclusão em lote. */
  protected readonly despesasSelecionadasIds = signal(new Set<string>());

  protected readonly todasDespesasSelecionadas = computed(() => {
    const lista = this.despesasOrdenadas();
    const sel = this.despesasSelecionadasIds();
    return lista.length > 0 && lista.every((d) => sel.has(d.id));
  });

  protected readonly algumaDespesaSelecionada = computed(
    () =>
      this.despesasOrdenadas().some((d) => this.despesasSelecionadasIds().has(d.id)),
  );

  protected toggleSelecionarDespesa(id: string, checked: boolean): void {
    this.despesasSelecionadasIds.update((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  protected toggleMarcarTodasDespesas(): void {
    const lista = this.despesasOrdenadas();
    if (lista.length === 0) {
      return;
    }
    if (this.todasDespesasSelecionadas()) {
      this.despesasSelecionadasIds.set(new Set());
    } else {
      this.despesasSelecionadasIds.set(new Set(lista.map((d) => d.id)));
    }
  }

  protected removerDespesasSelecionadas(): void {
    const idsVisiveis = this.despesasOrdenadas()
      .map((d) => d.id)
      .filter((id) => this.despesasSelecionadasIds().has(id));
    if (idsVisiveis.length === 0) {
      return;
    }
    const n = idsVisiveis.length;
    if (!confirm(`Remover ${n} despesa(s) selecionada(s)?`)) {
      return;
    }
    const editing = this.editingDespesaId();
    if (editing && idsVisiveis.includes(editing)) {
      this.cancelarEdicaoDespesa();
    }
    this.store.removeDespesas(idsVisiveis);
    this.despesasSelecionadasIds.update((prev) => {
      const next = new Set(prev);
      for (const id of idsVisiveis) {
        next.delete(id);
      }
      return next;
    });
  }

  /** IDs marcados na tabela de dívidas para exclusão em lote. */
  protected readonly dividasSelecionadasIds = signal(new Set<string>());

  protected readonly todasDividasSelecionadas = computed(() => {
    const lista = this.dividasOrdenadas();
    const sel = this.dividasSelecionadasIds();
    return lista.length > 0 && lista.every((d) => sel.has(d.id));
  });

  protected readonly algumaDividaSelecionada = computed(
    () => this.dividasSelecionadasIds().size > 0,
  );

  protected toggleSelecionarDivida(id: string, checked: boolean): void {
    this.dividasSelecionadasIds.update((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  protected toggleMarcarTodasDividas(): void {
    const lista = this.dividasOrdenadas();
    if (lista.length === 0) {
      return;
    }
    if (this.todasDividasSelecionadas()) {
      this.dividasSelecionadasIds.set(new Set());
    } else {
      this.dividasSelecionadasIds.set(new Set(lista.map((d) => d.id)));
    }
  }

  protected removerDividasSelecionadas(): void {
    const ids = [...this.dividasSelecionadasIds()];
    if (ids.length === 0) {
      return;
    }
    const n = ids.length;
    if (!confirm(`Remover ${n} dívida(s) selecionada(s)?`)) {
      return;
    }
    const editing = this.editingDividaId();
    if (editing && ids.includes(editing)) {
      this.cancelarEdicaoDivida();
    }
    this.store.removeDividas(ids);
    this.dividasSelecionadasIds.set(new Set());
  }

  protected setTheme(mode: ThemeMode): void {
    this.theme.setMode(mode);
  }

  protected definirMesReferencia(event: Event): void {
    const el = event.target as HTMLInputElement;
    if (el.value) {
      this.store.setMesReferencia(el.value);
    }
  }

  protected importarBackupJson(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = this.store.parseBackupJson(text);
      if (!parsed.ok) {
        alert(parsed.error);
        input.value = '';
        return;
      }
      const nRec = parsed.state.receitas.length;
      const nDes = parsed.state.despesas.length;
      const nDiv = parsed.state.dividas.length;
      const msg = `Substituir todos os dados locais por este backup?\n\nReceitas: ${nRec}\nDespesas: ${nDes}\nDívidas: ${nDiv}`;
      if (!confirm(msg)) {
        input.value = '';
        return;
      }
      this.store.applyImportedState(parsed.state);
      this.cancelarEdicaoReceita();
      this.cancelarEdicaoDespesa();
      this.cancelarEdicaoDivida();
      this.store.irParaMesAtual();
      input.value = '';
    };
    reader.onerror = () => {
      alert('Não foi possível ler o arquivo.');
      input.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  protected importarDespesasJsonMesclar(event: Event): void {
    this.lerArquivoDespesasJson(event, 'mesclar');
  }

  protected importarDespesasJsonSubstituir(event: Event): void {
    this.lerArquivoDespesasJson(event, 'substituir');
  }

  protected importarDividasJsonMesclar(event: Event): void {
    this.lerArquivoDividasJson(event, 'mesclar');
  }

  protected importarDividasJsonSubstituir(event: Event): void {
    this.lerArquivoDividasJson(event, 'substituir');
  }

  private lerArquivoDespesasJson(
    event: Event,
    modo: 'mesclar' | 'substituir',
  ): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = this.store.parseDespesasJson(text);
      if (!parsed.ok) {
        alert(parsed.error);
        input.value = '';
        return;
      }
      const n = parsed.despesas.length;
      const atual = this.store.despesas().length;
      if (modo === 'mesclar') {
        if (n === 0) {
          alert('O arquivo não contém despesas válidas para adicionar.');
          input.value = '';
          return;
        }
        if (
          !confirm(
            `Adicionar ${n} despesa(s) às ${atual} já cadastradas? IDs duplicados serão trocados automaticamente.`,
          )
        ) {
          input.value = '';
          return;
        }
        this.store.mergeImportedDespesas(parsed.despesas);
      } else {
        const msg = `Substituir todas as ${atual} despesas locais por ${n} do arquivo? Receitas e dívidas não mudam.`;
        if (!confirm(msg)) {
          input.value = '';
          return;
        }
        this.store.replaceDespesasImport(parsed.despesas);
      }
      this.cancelarEdicaoDespesa();
      input.value = '';
    };
    reader.onerror = () => {
      alert('Não foi possível ler o arquivo.');
      input.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  private lerArquivoDividasJson(
    event: Event,
    modo: 'mesclar' | 'substituir',
  ): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = this.store.parseDividasJson(text);
      if (!parsed.ok) {
        alert(parsed.error);
        input.value = '';
        return;
      }
      const n = parsed.dividas.length;
      const atual = this.store.dividas().length;
      if (modo === 'mesclar') {
        if (n === 0) {
          alert('O arquivo não contém dívidas válidas para adicionar.');
          input.value = '';
          return;
        }
        if (
          !confirm(
            `Adicionar ${n} dívida(s) às ${atual} já cadastradas? IDs duplicados serão trocados automaticamente.`,
          )
        ) {
          input.value = '';
          return;
        }
        this.store.mergeImportedDividas(parsed.dividas);
      } else {
        const msg = `Substituir todas as ${atual} dívidas locais por ${n} do arquivo? Receitas e despesas não mudam.`;
        if (!confirm(msg)) {
          input.value = '';
          return;
        }
        this.store.replaceDividasImport(parsed.dividas);
      }
      this.cancelarEdicaoDivida();
      input.value = '';
    };
    reader.onerror = () => {
      alert('Não foi possível ler o arquivo.');
      input.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  /** Exibe data ISO yyyy-MM-dd como dd/MM/yyyy (sem Date — evita fuso). */
  protected formatarDataIso(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
  }

  private formatBrl(valor: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }

  private notificarNovoLancamento(titulo: string, detalhe: string): void {
    void Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: titulo,
      text: detalhe,
      showConfirmButton: false,
      timer: 3200,
      timerProgressBar: true,
    });
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
      this.notificarNovoLancamento(
        'Nova receita salva',
        `${raw.descricao} · ${this.formatBrl(raw.valor)}`,
      );
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
      this.notificarNovoLancamento(
        'Nova despesa salva',
        `${raw.descricao} · ${this.formatBrl(raw.valor)}`,
      );
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
      this.notificarNovoLancamento(
        'Nova dívida salva',
        `${raw.credor} · saldo ${this.formatBrl(raw.saldoTotal)}`,
      );
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
    this.despesasSelecionadasIds.update((prev) => {
      if (!prev.has(item.id)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  }

  protected removerDivida(item: Divida): void {
    if (!confirm(`Remover a dívida com "${item.credor}"?`)) {
      return;
    }
    if (this.editingDividaId() === item.id) {
      this.cancelarEdicaoDivida();
    }
    this.store.removeDivida(item.id);
    this.dividasSelecionadasIds.update((prev) => {
      if (!prev.has(item.id)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
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
