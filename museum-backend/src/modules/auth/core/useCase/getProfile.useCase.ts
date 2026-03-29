import type { UserRole } from '../domain/user-role';
import type { IUserRepository } from '../domain/user.repository.interface';

interface UserProfile {
  id: number;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  role: UserRole;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Fetches the full user profile from the database. Used by /me and /export-data after JWT was stripped of PII. */
export class GetProfileUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /** Fetches the user profile by ID, returning null if not found. */
  async execute(userId: number): Promise<UserProfile | null> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      firstname: user.firstname ?? null,
      lastname: user.lastname ?? null,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: role may be undefined in legacy DB rows
      role: user.role || 'visitor',
      onboardingCompleted:
        (user as unknown as Record<string, unknown>).onboarding_completed === true,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
