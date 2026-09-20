import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';
import authRoutes from './auth.routes';
import versionRoutes from './version.routes';
import userRoutes from './user.routes';
import exerciseRoutes from './exercise.routes';
import workoutRoutes from './workout.routes';
import gymRoutes from './gym.routes';
import trainingRoutes from './training.routes';
import renewalsRoutes from './renewals.routes';

const router = Router();

router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({
    success: true,
    message: 'API attiva',
    database: 'connesso',
    timestamp: new Date().toISOString(),
  });
});

// Prima delle altre: deve rispondere anche ad app non autenticate
router.use('/version', versionRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/exercises', exerciseRoutes);
router.use('/workouts', workoutRoutes);
router.use('/gym', gymRoutes);
router.use('/training', trainingRoutes);
router.use('/renewals', renewalsRoutes);

export default router;
