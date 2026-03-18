/**
 * Auth module composition root.
 * Wires repository implementations to use-case classes and exports ready-to-use singleton instances.
 */
import { RegisterUseCase } from './register.useCase';
import { ForgotPasswordUseCase } from './forgotPassword.useCase';
import { ResetPasswordUseCase } from './resetPassword.useCase';
import { AuthSessionService } from './authSession.service';
import { SocialLoginUseCase } from './socialLogin.useCase';
import { DeleteAccountUseCase } from './deleteAccount.useCase';
import { UserRepositoryPg } from '../../../auth/adapters/secondary/user.repository.pg';
import { SocialAccountRepositoryPg } from '../../../auth/adapters/secondary/social-account.repository.pg';

const userRepository = new UserRepositoryPg();
const socialAccountRepository = new SocialAccountRepositoryPg();

/** Singleton instance of {@link RegisterUseCase}. */
const registerUseCase = new RegisterUseCase(userRepository);
/** Singleton instance of {@link ForgotPasswordUseCase}. */
const forgotPasswordUseCase = new ForgotPasswordUseCase(userRepository);
/** Singleton instance of {@link ResetPasswordUseCase}. */
const resetPasswordUseCase = new ResetPasswordUseCase(userRepository);
/** Singleton instance of {@link AuthSessionService}. */
const authSessionService = new AuthSessionService(userRepository);
/** Singleton instance of {@link SocialLoginUseCase}. */
const socialLoginUseCase = new SocialLoginUseCase(
  userRepository,
  socialAccountRepository,
  authSessionService,
);
/** Singleton instance of {@link DeleteAccountUseCase}. */
const deleteAccountUseCase = new DeleteAccountUseCase(userRepository);

export {
  registerUseCase,
  forgotPasswordUseCase,
  resetPasswordUseCase,
  authSessionService,
  socialLoginUseCase,
  deleteAccountUseCase,
};
