const counters = new Map<string, number>();

export function incrementCounter(name: string): void {
  counters.set(name, (counters.get(name) ?? 0) + 1);
}

export function getCounter(name: string): number {
  return counters.get(name) ?? 0;
}

export function resetCountersForTest(): void {
  counters.clear();
}
