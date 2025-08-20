import { Router } from 'express';
import { ContactController } from './contact.controller';
const router = Router();

router.post('/create-contact', ContactController.createContact);
export const ContactRoutes = router;
