import { User } from '@crypto-strategy-lab/shared';
import argon2 from 'argon2';
import { AuthServiceInterface } from '@/api/features/auth/services/interfaces/authService.interface';
import { AuthRepository } from '@/api/features/auth/repositories/interfaces/authRepository.interface';
import { AppError } from '@/errors/AppError';

export class AuthService implements AuthServiceInterface {
  constructor(private readonly authRepository: AuthRepository) {}

  async authenticate(email: string, password: string): Promise<User> {
    const userRecord = await this.authRepository.findByEmail(email);
    if (!userRecord) {
      throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
    }

    const valid = await argon2.verify(userRecord.passwordHash, password);
    if (!valid) {
      throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
    }

    return {
      id: userRecord.id,
      email: userRecord.email,
      role: userRecord.role,
    };
  }

  async register(email: string, password: string): Promise<User> {
    // Check if user already exists
    const existingUser = await this.authRepository.findByEmail(email);
    if (existingUser) {
      throw new AppError('Email already exists', 409, 'CONFLICT');
    }

    const passwordHash = await argon2.hash(password);
    const userRecord = await this.authRepository.create(email, passwordHash);

    return {
      id: userRecord.id,
      email: userRecord.email,
      role: userRecord.role,
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    const userRecord = await this.authRepository.findById(userId);
    if (!userRecord) return null;

    return {
      id: userRecord.id,
      email: userRecord.email,
      role: userRecord.role,
    };
  }

  async ensureAdmin(email: string, defaultPassword?: string): Promise<boolean> {
    let userRecord = await this.authRepository.findByEmail(email);

    if (!userRecord) {
      const passwordToUse = defaultPassword || 'admin123';
      const passwordHash = await argon2.hash(passwordToUse);
      userRecord = await this.authRepository.create(email, passwordHash);
    }

    if (userRecord.role !== 'ADMIN') {
      if (!this.authRepository.updateRole) {
        throw new Error('AuthRepository does not implement updateRole');
      }
      await this.authRepository.updateRole(userRecord.id, 'ADMIN' as any);
      return true;
    }

    return false;
  }
}
