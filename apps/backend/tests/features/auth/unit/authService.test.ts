/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PasswordAuthService } from '@/api/features/auth/services/authService';
import { AuthRepository } from '@/api/features/auth/repositories/interfaces/authRepository.interface';
import { AppError } from '@/errors/AppError';
import argon2 from 'argon2';

vi.mock('argon2');

describe('PasswordAuthService', () => {
  let authService: PasswordAuthService;
  let authRepositoryMock: AuthRepository;

  beforeEach(() => {
    authRepositoryMock = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      updateRole: vi.fn(),
    };
    authService = new PasswordAuthService(authRepositoryMock);
    vi.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should throw if user not found', async () => {
      (authRepositoryMock.findByEmail as any).mockResolvedValue(null);
      await expect(
        authService.authenticate('test@test.com', 'pass'),
      ).rejects.toThrow(AppError);
    });

    it('should throw if password invalid', async () => {
      (authRepositoryMock.findByEmail as any).mockResolvedValue({
        id: '1',
        passwordHash: 'hash',
        role: 'USER',
      });
      (argon2.verify as any).mockResolvedValue(false);
      await expect(
        authService.authenticate('test@test.com', 'pass'),
      ).rejects.toThrow(AppError);
    });

    it('should return user if credentials valid', async () => {
      (authRepositoryMock.findByEmail as any).mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        passwordHash: 'hash',
        role: 'USER',
      });
      (argon2.verify as any).mockResolvedValue(true);

      const user = await authService.authenticate('test@test.com', 'pass');
      expect(user).toEqual({ id: '1', email: 'test@test.com', role: 'USER' });
    });
  });

  describe('register', () => {
    it('should throw if email already exists', async () => {
      (authRepositoryMock.findByEmail as any).mockResolvedValue({ id: '1' });
      await expect(
        authService.register('test@test.com', 'pass'),
      ).rejects.toThrow(AppError);
    });

    it('should create user and return it', async () => {
      (authRepositoryMock.findByEmail as any).mockResolvedValue(null);
      (argon2.hash as any).mockResolvedValue('hashedpass');
      (authRepositoryMock.create as any).mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        passwordHash: 'hashedpass',
        role: 'USER',
      });

      const user = await authService.register('test@test.com', 'pass');
      expect(authRepositoryMock.create).toHaveBeenCalledWith(
        'test@test.com',
        'hashedpass',
      );
      expect(user).toEqual({ id: '1', email: 'test@test.com', role: 'USER' });
    });
  });

  describe('validateUser', () => {
    it('should return null if user not found', async () => {
      (authRepositoryMock.findById as any).mockResolvedValue(null);
      const user = await authService.validateUser('1');
      expect(user).toBeNull();
    });

    it('should return user if found', async () => {
      (authRepositoryMock.findById as any).mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        role: 'USER',
      });
      const user = await authService.validateUser('1');
      expect(user).toEqual({ id: '1', email: 'test@test.com', role: 'USER' });
    });
  });

  describe('ensureAdmin', () => {
    it('should create admin user and update role if created as USER', async () => {
      (authRepositoryMock.findByEmail as any).mockResolvedValue(null);
      (argon2.hash as any).mockResolvedValue('hash');
      (authRepositoryMock.create as any).mockResolvedValue({
        id: '1',
        role: 'USER',
      });

      const updated = await authService.ensureAdmin('admin@test.com', 'pass');
      expect(authRepositoryMock.create).toHaveBeenCalledWith(
        'admin@test.com',
        'hash',
      );
      expect(authRepositoryMock.updateRole).toHaveBeenCalledWith('1', 'ADMIN');
      expect(updated).toBe(true);
    });

    it('should update role to ADMIN if user exists but is not ADMIN', async () => {
      (authRepositoryMock.findByEmail as any).mockResolvedValue({
        id: '1',
        role: 'USER',
      });

      const updated = await authService.ensureAdmin('admin@test.com', 'pass');
      expect(authRepositoryMock.updateRole).toHaveBeenCalledWith('1', 'ADMIN');
      expect(updated).toBe(true);
    });

    it('should do nothing and return false if user is already ADMIN', async () => {
      (authRepositoryMock.findByEmail as any).mockResolvedValue({
        id: '1',
        role: 'ADMIN',
      });
      const result = await authService.ensureAdmin('admin@test.com', 'pass');
      expect(result).toBe(false);
      expect(authRepositoryMock.updateRole).not.toHaveBeenCalled();
    });
  });
});
