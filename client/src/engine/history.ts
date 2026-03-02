export type HistoryEntry<T> = {
  actionId: string;
  state: T;
  at: number;
};

export class HistoryController<T> {
  private readonly limit: number;
  private undoStack: Array<HistoryEntry<T>> = [];
  private redoStack: Array<HistoryEntry<T>> = [];
  private inProgress: { actionId: string; before: T } | null = null;

  constructor(options: { limit?: number } = {}) {
    this.limit = Math.max(1, Math.floor(options.limit ?? 120));
  }

  beginAction(actionId: string, before: T): void {
    if (this.inProgress) return;
    this.inProgress = { actionId, before };
  }

  commitAction(current: T): boolean {
    const pending = this.inProgress;
    if (!pending) return false;
    this.inProgress = null;
    if (Object.is(current, pending.before)) return false;
    this.pushUndo(pending.actionId, pending.before);
    return true;
  }

  cancelAction(): void {
    this.inProgress = null;
  }

  pushUndo(actionId: string, before: T): void {
    this.undoStack.push({ actionId, state: before, at: Date.now() });
    if (this.undoStack.length > this.limit) {
      this.undoStack.splice(0, this.undoStack.length - this.limit);
    }
    this.redoStack = [];
  }

  undo(current: T): T {
    this.cancelAction();
    const entry = this.undoStack.pop();
    if (!entry) return current;
    this.redoStack.push({ actionId: entry.actionId, state: current, at: Date.now() });
    if (this.redoStack.length > this.limit) {
      this.redoStack.splice(0, this.redoStack.length - this.limit);
    }
    return entry.state;
  }

  redo(current: T): T {
    this.cancelAction();
    const entry = this.redoStack.pop();
    if (!entry) return current;
    this.undoStack.push({ actionId: entry.actionId, state: current, at: Date.now() });
    if (this.undoStack.length > this.limit) {
      this.undoStack.splice(0, this.undoStack.length - this.limit);
    }
    return entry.state;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.inProgress = null;
  }
}

