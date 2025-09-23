export interface ImageInsightRequest {
  imageBase64: string;
  conversationId?: string;
  language?: 'fr' | 'en';
  // Tone of the response: beginner, expert, confirmed (optional)
  tone?: 'beginner' | 'expert' | 'confirmed';
}
