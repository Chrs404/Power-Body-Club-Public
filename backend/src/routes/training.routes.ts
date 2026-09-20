import { Router } from 'express';
import * as trainingController from '../controllers/training.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { createWeightLogSchema } from '../schemas/training.schema';

const router = Router();

router.use(authenticate);

// --- Sessione di allenamento ---
router.get('/session/current', trainingController.currentSession);
router.post('/session/reset', trainingController.resetSession);
router.get('/session/history', trainingController.sessionHistory);
router.post('/session/exercises/:workoutExerciseId', trainingController.markExercise);
router.delete('/session/exercises/:workoutExerciseId', trainingController.unmarkExercise);

// --- Storico pesi ---
router.get('/weights', trainingController.weightHistory);
router.get('/weights/latest', trainingController.latestWeights);
router.post('/weights', validate(createWeightLogSchema), trainingController.createWeightLog);
router.delete('/weights/:id', trainingController.deleteWeightLog);

export default router;
