/** Payload delivered by the public support-contact channel. */
export interface SupportContactPayload {
  name: string;
  email: string;
  message: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

/** Outbound port used to forward public support-contact submissions. */
export interface SupportContactNotifier {
  notify(payload: SupportContactPayload): Promise<void>;
}
