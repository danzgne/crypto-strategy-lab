import { Router } from 'express';
import { AuthProvider } from '@crypto-strategy-lab/shared';

export function createAuthRouter(authProvider: AuthProvider) {
  const router = Router();

  router.post('/register', async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res
          .status(400)
          .json({ error: 'Email and password are required' });
      }
      const user = await authProvider.register(email, password);
      req.session.userId = user.id;
      req.session.role = user.role;
      res.status(201).json(user);
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res
          .status(400)
          .json({ error: 'Email and password are required' });
      }
      const user = await authProvider.authenticate(email, password);
      req.session.userId = user.id;
      req.session.role = user.role;
      res.json(user);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Invalid email or password') {
        res.status(401).json({ error: err.message });
      } else {
        next(err);
      }
    }
  });

  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out' });
    });
  });

  router.get('/me', async (req, res, next) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      const user = await authProvider.validateUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
