import { CurrencyPipe, PercentPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FinanceStore } from '@helpme/data-access';
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
  private readonly fb = inject(FormBuilder);

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

  protected cadastrarReceita(): void {
    if (this.receitaForm.invalid) {
      return;
    }
    this.store.addReceita(this.receitaForm.getRawValue());
    this.receitaForm.patchValue({
      descricao: '',
      valor: 0,
      data: new Date().toISOString().slice(0, 10),
    });
  }

  protected cadastrarDespesa(): void {
    if (this.despesaForm.invalid) {
      return;
    }
    this.store.addDespesa(this.despesaForm.getRawValue());
    this.despesaForm.patchValue({
      descricao: '',
      categoria: '',
      valor: 0,
      data: new Date().toISOString().slice(0, 10),
      essencial: true,
    });
  }

  protected cadastrarDivida(): void {
    if (this.dividaForm.invalid) {
      return;
    }
    this.store.addDivida(this.dividaForm.getRawValue());
    this.dividaForm.patchValue({
      credor: '',
      saldoTotal: 0,
      parcelaMinima: 0,
      jurosMensal: 0,
      vencimentoDia: 10,
    });
  }
}
