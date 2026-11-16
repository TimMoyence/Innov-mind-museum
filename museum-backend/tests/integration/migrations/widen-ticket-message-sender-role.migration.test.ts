import { WidenTicketMessageSenderRole1794847191041 } from '@src/data/db/migrations/1794847191041-WidenTicketMessageSenderRole';
import { User } from '@modules/auth/domain/user/user.entity';
import { SupportTicket } from '@modules/support/domain/ticket/supportTicket.entity';
import { TicketMessage } from '@modules/support/domain/ticket/ticketMessage.entity';
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('WidenTicketMessageSenderRole migration [integration, real PG]', () => {
  let harness: IntegrationHarness;
  const migration = new WidenTicketMessageSenderRole1794847191041();

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const senderRoleLength = async (): Promise<number> => {
    const [row] = await harness.dataSource.query<{ character_maximum_length: number }[]>(
      `SELECT character_maximum_length FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ticket_messages' AND column_name = 'sender_role'`,
    );
    return row.character_maximum_length;
  };

  async function seedMessage(senderRole: string): Promise<string> {
    const fixture = makeUser({ email: 'author@test.dev' });
    const user = await harness.dataSource.getRepository(User).save({
      email: fixture.email,
      password: fixture.password,
      firstname: fixture.firstname,
      lastname: fixture.lastname,
      role: fixture.role,
      email_verified: fixture.email_verified,
      onboarding_completed: fixture.onboarding_completed,
      contentPreferences: fixture.contentPreferences,
    });
    const ticket = await harness.dataSource
      .getRepository(SupportTicket)
      .save({ userId: user.id, subject: 'Audio guide', description: 'The audio guide stops.' });
    const message = await harness.dataSource
      .getRepository(TicketMessage)
      .save({ ticketId: ticket.id, senderId: user.id, senderRole, text: 'Hello' });
    return message.id;
  }

  it('widens sender_role to the longest role and keeps the messages already stored', async () => {
    const runner = harness.dataSource.createQueryRunner();
    await migration.down(runner);
    const id = await seedMessage('visitor');

    await migration.up(runner);
    await runner.release();

    expect(await senderRoleLength()).toBe(32);
    await expect(
      harness.dataSource.getRepository(TicketMessage).findOneByOrFail({ id }),
    ).resolves.toMatchObject({ senderRole: 'visitor', text: 'Hello' });
  });

  it('refuses to narrow the column back while a longer role is stored', async () => {
    await seedMessage('museum_manager');
    const runner = harness.dataSource.createQueryRunner();

    await expect(migration.down(runner)).rejects.toThrow('value too long');
    await runner.release();

    expect(await senderRoleLength()).toBe(32);
  });
});
