import type { NextFunction, Request, Response } from 'express';
import type { PasswordAuthServiceInterface } from '@/api/features/auth/services/interfaces/authService.interface';
import { sendSuccess, sendError } from '@/utils/response/ApiResponse';

export class AuthController {
  public constructor(
    private readonly authService: PasswordAuthServiceInterface,
  ) {}

  public register = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        sendError(
          res,
          {
            code: 'VALIDATION_ERROR',
            message: 'Email and password are required',
          },
          400,
        );
        return;
      }

      const user = await this.authService.register(email, password);
      req.session.userId = user.id;
      req.session.role = user.role;

      sendSuccess(res, user, 201);
    } catch (error) {
      next(error);
    }
  };

  public login = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        sendError(
          res,
          {
            code: 'VALIDATION_ERROR',
            message: 'Email and password are required',
          },
          400,
        );
        return;
      }

      const user = await this.authService.authenticate(email, password);
      req.session.userId = user.id;
      req.session.role = user.role;

      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  };

  public logout = (req: Request, res: Response, next: NextFunction): void => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      sendSuccess(res, { message: 'Logged out' });
    });
  };

  public me = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.session.userId) {
        sendError(
          res,
          { code: 'UNAUTHORIZED', message: 'Not authenticated' },
          401,
        );
        return;
      }

      const user = await this.authService.validateUser(req.session.userId);
      if (!user) {
        sendError(
          res,
          { code: 'UNAUTHORIZED', message: 'User not found' },
          401,
        );
        return;
      }

      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  };
}
