import { AuthProvider, User, Role } from '@crypto-strategy-lab/shared';
import { PrismaClient } from '../../../../generated/prisma/client';
import argon2 from 'argon2';

export class PostgresAuthProvider implements AuthProvider {
  constructor(private readonly prisma: PrismaClient) {}

  async authenticate(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role as Role,
    };
  }

  async register(email: string, password: string): Promise<User> {
    const passwordHash = await argon2.hash(password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role as Role,
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role as Role,
    };
  }
}
