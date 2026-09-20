import { Router } from 'express';
import * as exerciseController from '../controllers/exercise.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createExerciseSchema, updateExerciseSchema } from '../schemas/exercise.schema';

const router = Router();

router.use(authenticate);

// Lettura consentita anche ai clienti: serve per mostrare i dettagli
// degli esercizi nella propria scheda.
router.get('/', exerciseController.list);
router.get('/:id', exerciseController.getOne);

router.use(authorize('TRAINER'));

router.post('/', validate(createExerciseSchema), exerciseController.create);
router.patch('/:id', validate(updateExerciseSchema), exerciseController.update);
router.delete('/:id', exerciseController.remove);

export default router;
