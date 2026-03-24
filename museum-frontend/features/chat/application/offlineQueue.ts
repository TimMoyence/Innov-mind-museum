export interface QueuedMessage {
  id: string;
  sessionId: string;
  text?: string;
  imageUri?: string;
  createdAt: number;
  retryCount: number;
}

export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const STORAGE_KEY = 'musaium.offline.queue';

export class OfflineQueue {
  private queue: QueuedMessage[] = [];
  private snapshot: readonly QueuedMessage[] = [];
  private listeners: Set<() => void> = new Set();
  private storage: QueueStorage | null;

  constructor(storage?: QueueStorage) {
    this.storage = storage ?? null;
  }

  /**
   * Loads persisted queue entries from storage.
   * Call once after construction to rehydrate the queue.
   */
  async hydrate(): Promise<void> {
    if (!this.storage) return;
    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.queue = parsed as QueuedMessage[];
          this.notify();
        }
      }
    } catch {
      // Corrupted data — start fresh
    }
  }

  enqueue(message: Omit<QueuedMessage, 'id' | 'createdAt' | 'retryCount'>): QueuedMessage {
    const entry: QueuedMessage = {
      ...message,
      id: `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
      retryCount: 0,
    };
    this.queue.push(entry);
    this.notify();
    void this.persist();
    return entry;
  }

  dequeue(): QueuedMessage | undefined {
    const item = this.queue.shift();
    if (item) {
      this.notify();
      void this.persist();
    }
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
    if (item) {
      item.retryCount++;
      void this.persist();
    }
  }

  remove(id: string): void {
    this.queue = this.queue.filter(m => m.id !== id);
    this.notify();
    void this.persist();
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

  private async persist(): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      // Storage write failed — queue remains in memory
    }
  }
}
