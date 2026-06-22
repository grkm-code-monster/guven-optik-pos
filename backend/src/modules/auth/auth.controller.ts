import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { LoginInput, VerifyManagerPinInput } from './auth.types';
import * as authService from './auth.service';

const router = Router();

function handleAuthError(err: unknown, res: Response): boolean {
  if (!(err instanceof Error) || !('code' in err)) {
    return false;
  }
  const code = (err as Error & { code: string }).code;
  if (code === 'ACCOUNT_LOCKED') {
    res.status(423).json({
      error: 'ACCOUNT_LOCKED',
      message: 'Çok fazla hatalı deneme. Lütfen 5 dakika sonra tekrar deneyin.',
    });
    return true;
  }
  if (code === 'INVALID_CREDENTIALS') {
    res.status(401).json({
      error: 'INVALID_CREDENTIALS',
      message: 'Kullanıcı adı veya PIN hatalı.',
    });
    return true;
  }
  if (code === 'USER_INACTIVE') {
    res.status(403).json({
      error: 'USER_INACTIVE',
      message: 'Hesap devre dışı.',
    });
    return true;
  }
  if (code === 'MANAGER_PIN_INVALID') {
    res.status(401).json({
      error: 'MANAGER_PIN_INVALID',
      message: 'Müdür PIN doğrulanamadı.',
    });
    return true;
  }
  return false;
}

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = LoginInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Geçersiz istek gövdesi.',
      });
    }
    const { username, pin } = parsed.data;
    const result = await authService.login(username, pin);
    return res.status(200).json(result);
  } catch (err) {
    if (handleAuthError(err, res)) return;
    next(err);
  }
});

router.post('/verify-manager-pin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = VerifyManagerPinInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Geçersiz istek gövdesi.',
      });
    }
    const { pin, branchId } = parsed.data;
    const result = await authService.verifyManagerPin(pin, branchId);
    return res.status(200).json(result);
  } catch (err) {
    if (handleAuthError(err, res)) return;
    next(err);
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  return res.status(200).json({
    message: 'Çıkış yapıldı. İstemci tarafında token silinmelidir.',
  });
});

router.post('/pdks-continue', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.continueWithoutPdks(req.user!.userId, req.user!.branchId);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
