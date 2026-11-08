export interface SupportContactPayload {
  name: string;
  email: string;
  message: string;
  suspect?: boolean;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

export interface SupportContactNotifier {
  notify(payload: SupportContactPayload): Promise<void>;
}
