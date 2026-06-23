import { Router, type NextFunction, type Request, type Response } from 'express'
import { Role } from '@prisma/client'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { prisma } from '../../database/prisma'
import {
  bildirimleriOkunduIsaretle,
  bildirimOkundu,
  bildirimSayac,
  listBildirimler,
} from './bildirim.service'
import * as stokYonetimi from '../admin/stok-yonetimi.service'

const router = Router()
router.use(authenticate)

async function kullaniciSubeKodu(branchId: string): Promise<string | undefined> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { code: true } })
  return branch?.code
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!
    const okundu = req.query.okundu === 'true' ? true : req.query.okundu === 'false' ? false : false
    const data = await listBildirimler(user.userId, okundu)
    return res.json({ data })
  } catch (e) {
    next(e)
  }
})

router.get('/sayac', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!
    let count = await bildirimSayac(user.userId)

    if (user.role === Role.STORE_MANAGER) {
      const subeKodu = await kullaniciSubeKodu(user.branchId)
      const fiyatCount = await stokYonetimi.fiyatBildirimSayac(subeKodu)
      count += fiyatCount
    }

    return res.json({ count })
  } catch (e) {
    next(e)
  }
})

router.patch('/:id/okundu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!
    const data = await bildirimOkundu(req.params.id, user.userId)
    if (!data) return res.status(404).json({ error: 'Bildirim bulunamadı' })
    return res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
})

router.patch('/okundu-tumu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!
    const count = await bildirimleriOkunduIsaretle(user.userId)
    return res.json({ success: true, count })
  } catch (e) {
    next(e)
  }
})

export default router
