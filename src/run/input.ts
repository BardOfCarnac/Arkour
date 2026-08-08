export type RunAction = 'previous' | 'next' | 'select' | 'hold' | 'pause';

type Listener = (action: RunAction) => void;

export class RunInput {
  private readonly listeners = new Set<Listener>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(action: RunAction): void {
    for (const listener of this.listeners) listener(action);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.listeners.clear();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;

    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') this.emit('previous');
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') this.emit('next');
    if (event.key === 'Enter') this.emit('select');
    if (event.key === ' ' || event.key.toLowerCase() === 'h') {
      event.preventDefault();
      this.emit('hold');
    }
    if (event.key === 'Escape' || event.key.toLowerCase() === 'p') this.emit('pause');
  };
}
