export interface SupportContactPayload {
  name: string;
  email: string;
  message: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

export interface SupportContactNotifier {
  notify(payload: SupportContactPayload): Promise<void>;
}
