/** Port for sending transactional emails. */
export interface EmailService {
  /** Send a single transactional email. */
  sendEmail(to: string, subject: string, htmlContent: string): Promise<void>;
}
