export interface QueuedMessage {
  id: string;
  sessionId: string;
  text?: string;
  imageUri?: string;
  createdAt: number;
  retryCount: number;
}

export class OfflineQueue {
  private queue: QueuedMessage[] = [];
  private snapshot: readonly QueuedMessage[] = [];
  private listeners: Set<() => void> = new Set();

  enqueue(message: Omit<QueuedMessage, 'id' | 'createdAt' | 'retryCount'>): QueuedMessage {
    const entry: QueuedMessage = {
      ...message,
      id: `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
      retryCount: 0,
    };
    this.queue.push(entry);
    this.notify();
    return entry;
  }

  dequeue(): QueuedMessage | undefined {
    const item = this.queue.shift();
    if (item) this.notify();
    return item;
  }

  peek(): QueuedMessage | undefined {
    return this.queue[0];
  }

  size(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  incrementRetry(id: string): void {
    const item = this.queue.find(m => m.id === id);
    if (item) item.retryCount++;
  }

  remove(id: string): void {
    this.queue = this.queue.filter(m => m.id !== id);
    this.notify();
  }

  getAll(): readonly QueuedMessage[] {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.snapshot = [...this.queue];
    this.listeners.forEach(l => l());
  }
}
