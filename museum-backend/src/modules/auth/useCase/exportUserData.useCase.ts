import type { ChatDataExportPort, UserExportPayload } from '../domain/exportUserData.types';

interface ExportUserDataDeps {
  chatDataExport: ChatDataExportPort;
}

/** Assembles a GDPR-compliant data export payload for a given user. */
export class ExportUserDataUseCase {
  constructor(private readonly deps: ExportUserDataDeps) {}

  /** Assembles a GDPR-compliant data export payload for the given user. */
  async execute(user: {
    id: number;
    email: string;
    firstname?: string | null;
    lastname?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<UserExportPayload> {
    const chatData = await this.deps.chatDataExport.getAllUserData(user.id);

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        firstname: user.firstname ?? null,
        lastname: user.lastname ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      chatData,
    };
  }
}
