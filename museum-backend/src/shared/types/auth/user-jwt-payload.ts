/** Claims embedded in a signed JWT access token identifying the authenticated user. */
export interface UserJwtPayload {
  id: number;
  email: string;
  firstname?: string;
  lastname?: string;
}
