import { RegisterUseCase } from './register.useCase';
import { ForgotPasswordUseCase } from './forgotPassword.useCase';
import { ResetPasswordUseCase } from './resetPassword.useCase';
import { UserRepositoryPg } from '../../../auth/adapters/secondary/user.repository.pg';

// Instanciation de l'implémentation concrète du repository utilisateur
const userRepository = new UserRepositoryPg();

// Instanciation des use cases avec l'injection de dépendances
const registerUseCase = new RegisterUseCase(userRepository);
const forgotPasswordUseCase = new ForgotPasswordUseCase(userRepository);
const resetPasswordUseCase = new ResetPasswordUseCase(userRepository);

export { registerUseCase, forgotPasswordUseCase, resetPasswordUseCase };
