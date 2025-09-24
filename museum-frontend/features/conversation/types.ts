import type {
  ConversationDTO,
  ConversationMessageDTO,
} from '@/services/conversationService';

export type { ConversationDTO, ConversationMessageDTO };

export interface ConversationListItem {
  id: string;
  imageUrl: string;
  title: string;
  location: string;
  time: string;
  participants: number;
  tags: string[];
}

export type MessageSender = 'user' | 'ai';

export interface ChatMessage {
  id: string;
  text: string;
  sender: MessageSender;
  timestamp: Date;
}

export const LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;

export type ExperienceLevel = (typeof LEVELS)[number];
