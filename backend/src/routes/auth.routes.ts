import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { loginLimiter } from '../middleware/rate-limit';
import {
  loginSchema,
  firstAccessSchema,
  changePasswordSchema,
} from '../schemas/auth.schema';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), authController.login);

router.get('/me', authenticate, authController.me);

router.post(
  '/first-access',
  authenticate,
  validate(firstAccessSchema),
  authController.firstAccess
);

router.post(
  '/change-password',
  loginLimiter,
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);

export default router;
