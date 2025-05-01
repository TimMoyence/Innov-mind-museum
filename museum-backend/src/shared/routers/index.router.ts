import authRouter from '@modules/auth/adapters/primary/http/auth.route';
import ConversationRouter from '@modules/IA/conversation/adapters/primary/http/conversation.route';
import ImageInsightRouter from '@modules/IA/imageInsight/adapters/primary/http/imageInsight.route';
import museumIARouter from '@modules/IA/museum/adapters/primary/http/IAMuseum.route';
import { Router } from 'express';

const router: Router = Router();

router.use('/auth', authRouter);

router.use('/ia/museum', museumIARouter);

router.use('/image-insight', ImageInsightRouter);

router.use('/conversation', ConversationRouter);

export default router;
