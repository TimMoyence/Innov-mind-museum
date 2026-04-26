/**
 * Test fixture factory used by the GDPR DSAR (Art. 15 + 20) e2e tests.
 *
 * Seeds the database with a fully-populated user account spanning every
 * module that participates in the export: auth (consent grant), chat
 * (session + messages + audio reference), review, support (ticket + nested
 * message). The shape returned by `seedUserWithFullDataset` includes the
 * counts the e2e assertions rely on so callers don't recompute them.
 */
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

/**
 * Inserts a representative slice of user-owned data: 1 chat session w/ 2
 * messages (one carrying an audio reference), 1 approved review, 1 support
 * ticket w/ 1 user message, and 1 active consent grant.
 *
 * Uses raw SQL because the e2e harness already has an initialised DataSource;
 * fanning out through every module's repository would force this fixture to
 * import five composition roots, which is brittle.
 * @param harness
 * @param root0
 * @param root0.userId
 * @param root0.email
 */
export async function seedUserWithFullDataset(
  harness: E2EHarness,
  { userId, email }: SeedOptions,
): Promise<SeededDataset> {
  const ds = harness.dataSource;

  // 1. Chat session + 2 messages (one with an audioUrl).
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

  // 2. Public review by the user.
  await ds.query(
    `INSERT INTO reviews ("userId", "userName", rating, comment, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, 'Tester', 5, 'Excellent app for museum visits', 'approved'],
  );

  // 3. Support ticket + 1 message.
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

  // 4. Active consent grant.
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
      consentRecords: 1,
      mediaItems: 1, // one assistant audioUrl
    },
  };
}
