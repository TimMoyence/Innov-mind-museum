export interface NonceStore {
  issue(): Promise<string>;

  consume(nonce: string): Promise<boolean>;
}
