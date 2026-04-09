import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'helpme-theme-mode';

export type ThemeMode = 'system' | 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly modeSignal = signal<ThemeMode>('system');
  private mediaListener: (() => void) | null = null;

  /** Somente leitura para templates */
  readonly mode = this.modeSignal.asReadonly();

  /**
   * Deve ser chamado cedo (ex.: APP_INITIALIZER) para evitar flash de tema errado.
   */
  init(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    this.modeSignal.set(this.readStored());
    this.apply();

    if (this.mediaListener) {
      return;
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaListener = () => {
      if (this.modeSignal() === 'system') {
        this.apply();
      }
    };
    mq.addEventListener('change', this.mediaListener);
  }

  setMode(mode: ThemeMode): void {
    this.modeSignal.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore quota / private mode */
    }
    this.apply();
  }

  private readStored(): ThemeMode {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') {
        return raw;
      }
    } catch {
      /* ignore */
    }
    return 'system';
  }

  private apply(): void {
    const mode = this.modeSignal();
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = mode === 'dark' || (mode === 'system' && prefersDark);

    document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }
}
