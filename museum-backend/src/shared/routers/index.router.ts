import museumIARouter from '@modules/IA/museum/adapters/primary/http/IAMuseumRoute';
import { Router } from 'express';

const router: Router = Router();

router.use('/ia/museum', museumIARouter);

export default router;
