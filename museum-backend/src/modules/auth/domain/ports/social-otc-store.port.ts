export interface SocialOtcStore<TPayload> {
  issue(payload: TPayload): Promise<string>;

  consume(code: string): Promise<TPayload | null>;
}
