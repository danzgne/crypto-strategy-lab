import { PrismaClient } from '../../../../../../../generated/prisma/client';
import { AuthRepository, AuthUserRecord } from '@/api/features/auth/repositories/interfaces/authRepository.interface';
import { Role } from '@crypto-strategy-lab/shared';

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role as Role,
    };
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role as Role,
    };
  }

  async create(email: string, passwordHash: string): Promise<AuthUserRecord> {
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role as Role,
    };
  }

  async updateRole(id: string, role: Role): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { role },
    });
  }
}
