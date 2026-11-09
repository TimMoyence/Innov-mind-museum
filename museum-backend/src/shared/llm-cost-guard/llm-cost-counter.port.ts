export interface LlmCostCounter {
  get(userId: string, day: string): Promise<number>;

  increment(userId: string, day: string, dollars: number): Promise<number>;
}
