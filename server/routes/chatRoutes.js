import { Router } from 'express';
import { getMessages, healthCheck, sendMessage } from '../controllers/chatController.js';

const router = Router();

router.get('/health', healthCheck);
router.post('/chat', sendMessage);
router.get('/messages/:conversationId', getMessages);

export default router;
