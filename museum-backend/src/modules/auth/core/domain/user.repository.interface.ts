import { User } from './user.entity';

export interface IUserRepository {
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: number): Promise<User | null>;
  registerUser(
    email: string,
    password: string,
    firstname?: string,
    lastname?: string,
  ): Promise<User>;
  setResetToken(email: string, token: string, expires: Date): Promise<User>;
  getUserByResetToken(token: string): Promise<User | null>;
  updatePassword(userId: number, newPassword: string): Promise<User>;
}
