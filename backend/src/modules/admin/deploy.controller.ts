import { Role } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  getDeployLogTail,
  getDeployStepDefinitions,
  readDeployStatus,
  tryStartDeploy,
} from './deploy.service';

const router = Router();

router.use(authenticate);

router.get('/status', authorize(Role.ADMIN), (_req: Request, res: Response) => {
  const status = readDeployStatus();
  return res.json({
    data: status,
    logTail: getDeployLogTail(),
    steps: getDeployStepDefinitions(),
  });
});

router.post('/', authorize(Role.ADMIN), (_req: Request, res: Response) => {
  const result = tryStartDeploy();
  if (!result.ok) {
    return res.status(409).json({
      error: 'DEPLOY_ALREADY_RUNNING',
      message: 'Bir deploy işlemi zaten çalışıyor. Bitmesini bekleyin.',
    });
  }
  return res.json({ started: true });
});

export default router;
