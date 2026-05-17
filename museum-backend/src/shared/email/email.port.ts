export interface EmailService {
  sendEmail(to: string, subject: string, htmlContent: string): Promise<void>;
}
