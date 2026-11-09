import type { E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

interface SeedOptions {
  userId: number;
  email: string;
}

interface SeededDataset {
  userId: number;
  email: string;
  expectedShape: {
    chatSessions: number;
    chatMessages: number;
    reviews: number;
    supportTickets: number;
    supportMessages: number;
    consentRecords: number;
    mediaItems: number;
  };
}

export async function seedUserWithFullDataset(
  harness: E2EHarness,
  { userId, email }: SeedOptions,
): Promise<SeededDataset> {
  const ds = harness.dataSource;

  const sessionRows = await ds.query<{ id: string }[]>(
    `INSERT INTO chat_sessions ("userId", locale, "museumMode", title, "museumName")
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, 'fr-FR', true, 'Visit to Louvre', 'Louvre'],
  );
  const sessionId = sessionRows[0].id;

  await ds.query(
    `INSERT INTO chat_messages ("sessionId", role, text, "createdAt")
     VALUES ($1, 'user', 'Tell me about the Mona Lisa', NOW())`,
    [sessionId],
  );
  await ds.query(
    `INSERT INTO chat_messages ("sessionId", role, text, "audioUrl", "createdAt")
     VALUES ($1, 'assistant', 'The Mona Lisa is...', 's3://audio/test.mp3', NOW())`,
    [sessionId],
  );

  await ds.query(
    `INSERT INTO reviews ("userId", "userName", rating, comment, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, 'Tester', 5, 'Excellent app for museum visits', 'approved'],
  );

  const ticketRows = await ds.query<{ id: string }[]>(
    `INSERT INTO support_tickets ("userId", subject, description, status, priority)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, 'Audio playback issue', 'TTS audio fails on iOS', 'open', 'medium'],
  );
  const ticketId = ticketRows[0].id;

  await ds.query(
    `INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, text)
     VALUES ($1, $2, $3, $4)`,
    [ticketId, userId, 'user', 'Help please'],
  );

  await ds.query(
    `INSERT INTO user_consents (user_id, scope, version, source, granted_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [userId, 'location_to_llm', '2026-04-24', 'ui'],
  );

  return {
    userId,
    email,
    expectedShape: {
      chatSessions: 1,
      chatMessages: 2,
      reviews: 1,
      supportTickets: 1,
      supportMessages: 1,
      consentRecords: 2,
      mediaItems: 1,
    },
  };
}
