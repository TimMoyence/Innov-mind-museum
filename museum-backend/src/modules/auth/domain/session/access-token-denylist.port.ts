export interface IAccessTokenDenylist {
  add(jti: string, ttlSec: number): Promise<void>;

  has(jti: string): Promise<boolean>;
}
