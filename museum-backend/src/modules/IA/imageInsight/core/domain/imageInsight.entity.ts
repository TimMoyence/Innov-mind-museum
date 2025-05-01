export interface ImageInsightRequest {
  imageBase64: string;
  conversationId?: string;
  language?: 'fr' | 'en';
}
