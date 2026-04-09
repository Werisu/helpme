import { Component, input } from '@angular/core';
import { NgClass, CurrencyPipe, PercentPipe } from '@angular/common';

@Component({
  selector: 'lib-finance-stat-card',
  imports: [CurrencyPipe, PercentPipe],
  templateUrl: './ui.html',
  styleUrl: './ui.css',
})
export class FinanceStatCardComponent {
  readonly title = input.required<string>();
  readonly tone = input<'default' | 'danger' | 'ok'>('default');
  readonly value = input.required<number>();
  readonly valueType = input<'currency' | 'percent' | 'number'>('currency');
}

@Component({
  selector: 'lib-risk-pill',
  imports: [NgClass],
  template: `
    <span class="pill" [ngClass]="type()">{{ label() }}</span>
  `,
  styleUrl: './ui.css',
})
export class RiskPillComponent {
  readonly type = input.required<'critico' | 'atencao' | 'info'>();
  readonly label = input.required<string>();
}
