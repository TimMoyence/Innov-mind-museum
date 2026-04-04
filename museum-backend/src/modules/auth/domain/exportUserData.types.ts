/** Port interface for accessing chat data from the auth module (lazy-bound). */
export interface ChatDataExportPort {
  getAllUserData(userId: number): Promise<UserChatExportData>;
}

/**
 *
 */
export interface UserChatExportData {
  sessions: {
    id: string;
    locale?: string | null;
    museumMode: boolean;
    title?: string | null;
    museumName?: string | null;
    createdAt: string;
    updatedAt: string;
    messages: {
      id: string;
      role: string;
      text?: string | null;
      imageRef?: string | null;
      createdAt: string;
      metadata?: Record<string, unknown> | null;
    }[];
  }[];
}

/**
 *
 */
export interface UserExportPayload {
  exportedAt: string;
  user: {
    id: number;
    email: string;
    firstname?: string | null;
    lastname?: string | null;
    role?: string;
    createdAt: string;
    updatedAt: string;
  };
  chatData: UserChatExportData;
}
