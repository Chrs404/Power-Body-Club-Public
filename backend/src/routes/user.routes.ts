import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { sensitiveLimiter } from '../middleware/rate-limit';
import {
  createClientSchema,
  updateClientSchema,
  createSubscriptionSchema,
  updateProfileSchema,
} from '../schemas/user.schema';

const router = Router();

// Tutte le rotte richiedono autenticazione.
router.use(authenticate);

// --- Profilo personale (qualsiasi ruolo) ---
router.patch('/me', validate(updateProfileSchema), userController.updateOwnProfile);

// --- Gestione clienti (solo istruttore) ---
router.use(authorize('TRAINER'));

router.get('/summary', userController.summary);
router.get('/', userController.listClients);
router.post('/', sensitiveLimiter, validate(createClientSchema), userController.createClient);
router.get('/:id', userController.getClient);
router.patch('/:id', validate(updateClientSchema), userController.updateClient);
router.post('/:id/reset-password', sensitiveLimiter, userController.resetPassword);
router.post(
  '/:id/subscriptions',
  validate(createSubscriptionSchema),
  userController.addSubscription
);
router.delete('/:id/subscriptions/:subscriptionId', userController.deleteSubscription);

// Anteprima di cosa verrebbe eliminato, mostrata nella conferma.
router.get('/:id/deletion-preview', userController.deletionPreview);

// Eliminazione definitiva: limitata come le altre operazioni delicate.
router.delete('/:id', sensitiveLimiter, userController.deleteClient);

export default router;
