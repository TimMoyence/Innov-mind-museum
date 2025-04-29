import authRouter from '@modules/auth/adapters/primary/http/auth.route';
import museumIARouter from '@modules/IA/museum/adapters/primary/http/IAMuseumRoute';
import { Router } from 'express';

const router: Router = Router();

router.use('/ia/museum', museumIARouter);
router.use('/auth', authRouter);

export default router;
