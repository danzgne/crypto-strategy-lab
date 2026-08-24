import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '@/utils/response/ApiResponse';
import type { AuthServiceInterface } from '@/api/features/auth/services/interfaces/authService.interface';

export class AuthController {
  public constructor(private readonly authService: AuthServiceInterface) {}

  public register = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        // AppError can be thrown instead, but for now we'll match existing behavior
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const user = await this.authService.register(email, password);
      req.session.userId = user.id;
      req.session.role = user.role;

      // using res.status(201).json to maintain compatibility with existing frontend
      // which doesn't expect the ApiResponse { success: true, data: ... } wrapper yet
      res.status(201).json(user);
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
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const user = await this.authService.authenticate(email, password);
      req.session.userId = user.id;
      req.session.role = user.role;

      res.json(user);
    } catch (error) {
      next(error);
    }
  };

  public logout = (req: Request, res: Response, next: NextFunction): void => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out' });
    });
  };

  public me = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.session.userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const user = await this.authService.validateUser(req.session.userId);
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  };
}
