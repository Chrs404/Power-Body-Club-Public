import { Router } from 'express';
import * as gymController from '../controllers/gym.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  createNewsSchema,
  updateNewsSchema,
  updateScheduleSchema,
  createClosureSchema,
} from '../schemas/gym.schema';

const router = Router();

router.use(authenticate);

// --- Lettura (tutti) ---
router.get('/dashboard', gymController.dashboard);
router.get('/schedule', gymController.weeklySchedule);
router.get('/closures', gymController.closures);
router.get('/news', gymController.news);

// --- Gestione (solo istruttore) ---
router.use(authorize('TRAINER'));

router.get('/manage/news', gymController.allNews);
router.post('/manage/news', validate(createNewsSchema), gymController.createNews);
router.patch('/manage/news/:id', validate(updateNewsSchema), gymController.updateNews);
router.delete('/manage/news/:id', gymController.deleteNews);

router.put('/manage/schedule', validate(updateScheduleSchema), gymController.updateSchedule);

router.get('/manage/closures', gymController.allClosures);
router.post('/manage/closures', validate(createClosureSchema), gymController.createClosure);
router.delete('/manage/closures/:id', gymController.deleteClosure);

export default router;
