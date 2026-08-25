/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from '@/api/features/auth/controllers/authController';
import { PasswordAuthServiceInterface } from '@/api/features/auth/services/interfaces/authService.interface';
import { Request, Response, NextFunction } from 'express';
import { Role } from '@crypto-strategy-lab/shared';

describe('AuthController', () => {
  let authController: AuthController;
  let authServiceMock: PasswordAuthServiceInterface;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    authServiceMock = {
      authenticate: vi.fn(),
      register: vi.fn(),
      validateUser: vi.fn(),
      ensureAdmin: vi.fn(),
    };
    authController = new AuthController(authServiceMock);

    req = {
      body: {},
      session: {
        destroy: vi.fn().mockImplementation((cb) => cb(null)),
      } as any,
      requestId: 'test-req-id',
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      clearCookie: vi.fn(),
      req: req as any,
    };

    next = vi.fn();
  });

  describe('register', () => {
    it('should return 400 if email is missing', async () => {
      req.body = { password: 'password123' };
      await authController.register(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required',
        },
        requestId: 'test-req-id',
      });
    });

    it('should return 400 if password is missing', async () => {
      req.body = { email: 'test@test.com' };
      await authController.register(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should register a new user and set session', async () => {
      req.body = { email: 'test@test.com', password: 'password123' };
      const user = { id: '1', email: 'test@test.com', role: 'USER' as Role };
      (authServiceMock.register as any).mockResolvedValue(user);

      await authController.register(req as Request, res as Response, next);

      expect(authServiceMock.register).toHaveBeenCalledWith(
        'test@test.com',
        'password123',
      );
      expect(req.session!.userId).toBe('1');
      expect(req.session!.role).toBe('USER');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: user,
        requestId: 'test-req-id',
      });
    });

    it('should call next with error if service throws', async () => {
      req.body = { email: 'test@test.com', password: 'password123' };
      const error = new Error('conflict');
      (authServiceMock.register as any).mockRejectedValue(error);

      await authController.register(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('login', () => {
    it('should return 400 if email or password missing', async () => {
      req.body = { email: 'test@test.com' };
      await authController.login(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should login and set session', async () => {
      req.body = { email: 'test@test.com', password: 'password123' };
      const user = { id: '1', email: 'test@test.com', role: 'USER' as Role };
      (authServiceMock.authenticate as any).mockResolvedValue(user);

      await authController.login(req as Request, res as Response, next);

      expect(authServiceMock.authenticate).toHaveBeenCalledWith(
        'test@test.com',
        'password123',
      );
      expect(req.session!.userId).toBe('1');
      expect(req.session!.role).toBe('USER');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: user,
        requestId: 'test-req-id',
      });
    });

    it('should call next with error if authentication fails', async () => {
      req.body = { email: 'test@test.com', password: 'password123' };
      const error = new Error('invalid');
      (authServiceMock.authenticate as any).mockRejectedValue(error);

      await authController.login(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('logout', () => {
    it('should destroy session and clear cookie', () => {
      authController.logout(req as Request, res as Response, next);
      expect(req.session!.destroy).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Logged out' },
        requestId: 'test-req-id',
      });
    });

    it('should call next if session destroy fails', () => {
      const error = new Error('destroy failed');
      req.session!.destroy = vi.fn().mockImplementation((cb) => cb(error));
      authController.logout(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('me', () => {
    it('should return 401 if not authenticated', async () => {
      await authController.me(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        requestId: 'test-req-id',
      });
    });

    it('should return 401 if user not found', async () => {
      req.session!.userId = '1';
      (authServiceMock.validateUser as any).mockResolvedValue(null);

      await authController.me(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return user data if authenticated', async () => {
      req.session!.userId = '1';
      const user = { id: '1', email: 'test@test.com', role: 'USER' as Role };
      (authServiceMock.validateUser as any).mockResolvedValue(user);

      await authController.me(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: user,
        requestId: 'test-req-id',
      });
    });
  });
});
