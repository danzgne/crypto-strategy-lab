import { Router } from 'express';
import { AuthController } from '@/api/features/auth/controllers/authController';

export function createAuthFeatureRouter(authController: AuthController): Router {
  const router = Router();

  router.post('/register', authController.register);
  router.post('/login', authController.login);
  router.post('/logout', authController.logout);
  router.get('/me', authController.me);

  return router;
}
