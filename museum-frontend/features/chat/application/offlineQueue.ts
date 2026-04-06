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

interface OfflineQueueOptions {
  storage?: QueueStorage;
  maxQueueSize?: number;
  maxAgeMs?: number;
  /** Called with messages that were evicted during hydrate or prune. */
  onEvict?: (messages: QueuedMessage[]) => void;
}

const DEFAULT_MAX_QUEUE_SIZE = 50;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export class OfflineQueue {
  private queue: QueuedMessage[] = [];
  private snapshot: readonly QueuedMessage[] = [];
  private listeners = new Set<() => void>();
  private storage: QueueStorage | null;
  private maxQueueSize: number;
  private maxAgeMs: number;
  private onEvict: ((messages: QueuedMessage[]) => void) | null;

  constructor(options?: QueueStorage | OfflineQueueOptions) {
    if (options && typeof options === 'object' && 'getItem' in options) {
      // Legacy: constructor(storage?: QueueStorage)
      this.storage = options;
      this.maxQueueSize = DEFAULT_MAX_QUEUE_SIZE;
      this.maxAgeMs = DEFAULT_MAX_AGE_MS;
      this.onEvict = null;
    } else {
      const opts = options ?? {};
      this.storage = opts.storage ?? null;
      this.maxQueueSize = opts.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
      this.maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
      this.onEvict = opts.onEvict ?? null;
    }
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
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          const all = parsed as QueuedMessage[];
          const kept: QueuedMessage[] = [];
          const evicted: QueuedMessage[] = [];
          for (const m of all) {
            if (now - m.createdAt < this.maxAgeMs) {
              kept.push(m);
            } else {
              evicted.push(m);
            }
          }
          this.queue = kept;
          this.notify();
          void this.persist();
          if (evicted.length > 0) {
            this.onEvict?.(evicted);
          }
        }
      }
    } catch {
      // Corrupted data — start fresh
    }
  }

  enqueue(message: Omit<QueuedMessage, 'id' | 'createdAt' | 'retryCount'>): QueuedMessage | null {
    if (this.queue.length >= this.maxQueueSize) {
      return null;
    }

    const entry: QueuedMessage = {
      ...message,
      id: `offline-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
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
    const item = this.queue.find((m) => m.id === id);
    if (item) {
      item.retryCount++;
      void this.persist();
    }
  }

  remove(id: string): void {
    this.queue = this.queue.filter((m) => m.id !== id);
    this.notify();
    void this.persist();
  }

  /**
   * Removes messages older than maxAgeMs from the queue.
   */
  prune(): void {
    const now = Date.now();
    const kept: QueuedMessage[] = [];
    const evicted: QueuedMessage[] = [];
    for (const m of this.queue) {
      if (now - m.createdAt < this.maxAgeMs) {
        kept.push(m);
      } else {
        evicted.push(m);
      }
    }
    if (evicted.length > 0) {
      this.queue = kept;
      this.notify();
      void this.persist();
      this.onEvict?.(evicted);
    }
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
    this.listeners.forEach((l) => {
      l();
    });
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
