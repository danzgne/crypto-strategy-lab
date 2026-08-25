/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaAuthRepository } from '@/api/features/auth/repositories/prismaAuthRepository';
import { PrismaClient } from '../../../../../../generated/prisma/client';
import { Role } from '@crypto-strategy-lab/shared';

describe('PrismaAuthRepository', () => {
  let repository: PrismaAuthRepository;
  let prismaMock: Partial<PrismaClient>;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      } as any,
    };
    repository = new PrismaAuthRepository(prismaMock as PrismaClient);
  });

  describe('findByEmail', () => {
    it('should return null if user not found', async () => {
      (prismaMock.user!.findUnique as any).mockResolvedValue(null);
      const user = await repository.findByEmail('test@test.com');
      expect(user).toBeNull();
      expect(prismaMock.user!.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@test.com' },
      });
    });

    it('should return user if found', async () => {
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        passwordHash: 'hash',
        role: 'USER',
      };
      (prismaMock.user!.findUnique as any).mockResolvedValue(mockUser);

      const user = await repository.findByEmail('test@test.com');
      expect(user).toEqual(mockUser);
    });
  });

  describe('findById', () => {
    it('should return null if user not found', async () => {
      (prismaMock.user!.findUnique as any).mockResolvedValue(null);
      const user = await repository.findById('1');
      expect(user).toBeNull();
      expect(prismaMock.user!.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should return user if found', async () => {
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        passwordHash: 'hash',
        role: 'USER',
      };
      (prismaMock.user!.findUnique as any).mockResolvedValue(mockUser);

      const user = await repository.findById('1');
      expect(user).toEqual(mockUser);
    });
  });

  describe('create', () => {
    it('should create user and return it', async () => {
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        passwordHash: 'hash',
        role: 'USER',
      };
      (prismaMock.user!.create as any).mockResolvedValue(mockUser);

      const user = await repository.create('test@test.com', 'hash');
      expect(prismaMock.user!.create).toHaveBeenCalledWith({
        data: { email: 'test@test.com', passwordHash: 'hash' },
      });
      expect(user).toEqual(mockUser);
    });
  });

  describe('updateRole', () => {
    it('should update user role', async () => {
      await repository.updateRole('1', 'ADMIN' as Role);
      expect(prismaMock.user!.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { role: 'ADMIN' },
      });
    });
  });
});
