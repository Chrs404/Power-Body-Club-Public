import { Router } from 'express';
import * as workoutController from '../controllers/workout.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  createWorkoutSchema,
  updateWorkoutSchema,
  createTemplateSchema,
  assignTemplateSchema,
} from '../schemas/workout.schema';

const router = Router();

router.use(authenticate);

// Rotte del cliente autenticato. Devono precedere '/:id',
// altrimenti "me" verrebbe interpretato come identificativo.
router.get('/me/active', workoutController.myActive);
router.get('/me/list', workoutController.myWorkouts);

/*
 * Schede rapide (modelli), montate come sotto-router prima di '/:id'.
 *
 * Dichiarandole come rotte singole dopo '/:id', l'indirizzo "/modelli"
 * senza suffisso verrebbe interpretato come un identificativo di valore
 * "modelli", producendo un errore poco comprensibile. Un sotto-router
 * intercetta l'intero prefisso ed elimina l'ambiguita'.
 */
const modelli = Router();
modelli.use(authorize('TRAINER'));

modelli.get('/', workoutController.listTemplates);
modelli.post('/', validate(createTemplateSchema), workoutController.createTemplate);
modelli.get('/:id', workoutController.getTemplate);
modelli.patch('/:id', validate(updateWorkoutSchema), workoutController.updateTemplate);
modelli.delete('/:id', workoutController.deleteTemplate);
modelli.post('/:id/duplica', workoutController.duplicateTemplate);
modelli.get('/:id/pdf', workoutController.exportTemplatePdf);
modelli.post(
  '/:id/assegna',
  validate(assignTemplateSchema),
  workoutController.assignTemplate
);

router.use('/modelli', modelli);

// Il controllo di proprieta' e' dentro il controller:
// un cliente puo' aprire e scaricare solo le proprie schede.
router.get('/:id', workoutController.getOne);
router.get('/:id/pdf', workoutController.exportPdf);

router.use(authorize('TRAINER'));

router.get('/', workoutController.list);
router.post('/', validate(createWorkoutSchema), workoutController.create);
router.patch('/:id', validate(updateWorkoutSchema), workoutController.update);
router.post('/:id/archive', workoutController.archive);
router.post('/:id/duplicate', workoutController.duplicate);
router.delete('/:id', workoutController.remove);

export default router;
