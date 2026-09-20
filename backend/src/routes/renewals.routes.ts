import { Router } from 'express';
import * as renewalsController from '../controllers/renewals.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.use(authenticate);
router.use(authorize('TRAINER'));

router.get('/', renewalsController.list);

export default router;
