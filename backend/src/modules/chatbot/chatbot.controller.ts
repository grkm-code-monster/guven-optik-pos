import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../../database/prisma';
import { kullanimiKontrolEt, mesajGonder } from './chatbot.service';

const router = Router();

router.get('/durum', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Giriş gerekli' });
    }

    const durum = await kullanimiKontrolEt(userId, req.user?.role);
    return res.json(durum);
  } catch (err) {
    next(err);
  }
});

router.post('/mesaj', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Giriş gerekli' });
    }

    const { mesaj, gecmisMesajlar = [] } = req.body ?? {};
    if (!mesaj?.trim()) {
      return res.status(400).json({ error: 'Mesaj boş olamaz' });
    }

    const branch = req.user?.branchId
      ? await prisma.branch.findUnique({
          where: { id: req.user.branchId },
          select: { code: true },
        })
      : null;

    const sonuc = await mesajGonder(
      userId,
      req.user!.role,
      branch?.code ?? '',
      mesaj,
      gecmisMesajlar,
    );
    return res.json(sonuc);
  } catch (err) {
    next(err);
  }
});

export default router;
