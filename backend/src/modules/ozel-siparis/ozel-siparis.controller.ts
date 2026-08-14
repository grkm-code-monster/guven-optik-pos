import { Router, type NextFunction, type Request, type Response } from 'express'
import { Role } from '@prisma/client'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { prisma } from '../../database/prisma'
import { execute } from '../odoo/odoo.service'
import {
  getOzelSiparisLoglari,
  kaydetOzelSiparisKarekodlar,
  listOzelSiparisKarekodlar,
  updateOzelSiparisDurum,
} from './ozel-siparis.service'
import { createBildirimler } from '../bildirim/bildirim.service'
import { ozelSiparisDurumLabel } from './ozel-siparis.constants'

const router = Router()
router.use(authenticate)

async function subeKoduForUser(userId: string, branchId: string) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { code: true } })
  return branch?.code
}

router.get(
  '/sube',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.WAREHOUSE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!
      const durumlar = String(req.query.durumlar ?? '')
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)
      const subeKodu = await subeKoduForUser(user.userId, user.branchId)
      const where: any = {}
      if (subeKodu) where.subeId = subeKodu
      if (durumlar.length) where.durum = { in: durumlar }

      const siparisler = await prisma.ozelSiparis.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return res.json({ data: siparisler })
    } catch (e) {
      next(e)
    }
  },
)

router.get(
  '/:id/karekodlar',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.WAREHOUSE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await listOzelSiparisKarekodlar(req.params.id)
      return res.json({ data })
    } catch (e) {
      next(e)
    }
  },
)

router.get(
  '/:id/loglar',
  authorize(Role.ADMIN, Role.WAREHOUSE_MANAGER, Role.STORE_MANAGER, Role.REGIONAL_MANAGER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getOzelSiparisLoglari(req.params.id)
      return res.json({ data })
    } catch (e) {
      next(e)
    }
  },
)

router.post(
  '/:id/karekodlar',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.WAREHOUSE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const karekodlar = Array.isArray(req.body?.karekodlar) ? req.body.karekodlar : []
      const siparis = await kaydetOzelSiparisKarekodlar({
        siparisId: req.params.id,
        karekodlar,
        tarayanUserId: req.user?.userId,
      })
      return res.json({ success: true, data: siparis })
    } catch (e: any) {
      return res.status(400).json({ error: e?.message ?? 'Karekod kaydedilemedi' })
    }
  },
)

router.post(
  '/:id/musteri-teslim',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const siparis = await prisma.ozelSiparis.findUnique({ where: { id: req.params.id } })
      if (!siparis) return res.status(404).json({ error: 'Sipariş bulunamadı' })
      if (siparis.durum !== 'HAZIR') {
        return res.status(400).json({ error: 'Sadece HAZIR siparişler teslim edilebilir' })
      }

      let odooSonuc: string | null = null
      if (siparis.satisSiparisId && siparis.sirketId) {
        try {
          const sale = await prisma.sale.findUnique({
            where: { id: siparis.satisSiparisId },
            select: { odooSaleOrderId: true, odooSaleId: true },
          })
          const originRef = sale?.odooSaleOrderId ? String(sale.odooSaleOrderId) : (sale?.odooSaleId ?? null)
          if (originRef) {
            const pickings = await execute(
              'stock.picking',
              'search_read',
              [[['origin', 'ilike', originRef], ['state', '!=', 'done']]],
              { fields: ['id', 'name', 'state'], limit: 5 },
              siparis.sirketId,
            )
            for (const p of pickings ?? []) {
              try {
                await execute('stock.picking', 'button_validate', [[p.id]], {}, siparis.sirketId!)
                odooSonuc = `Teslimat doğrulandı: ${p.name}`
              } catch {
                /* picking validate opsiyonel */
              }
            }
          }
        } catch (err: any) {
          odooSonuc = `Odoo uyarı: ${String(err?.message ?? err).slice(0, 120)}`
        }
      }

      const updated = await updateOzelSiparisDurum(siparis.id, {
        durum: 'TESLIM_EDILDI',
        userId: req.user?.userId,
        bildirimGonder: true,
      })

      // Satış Teslimat ekranıyla senkron kalsın: bağlı satış kalemi varsa DELIVERED yap.
      if (siparis.saleItemId) {
        try {
          await prisma.saleItem.update({
            where: { id: siparis.saleItemId },
            data: { status: 'DELIVERED', deliveryDate: new Date() },
          })
        } catch (err) {
          console.error('[musteri-teslim] Satış kalemi senkron hatası:', err)
        }
      }

      const waPhone = siparis.musteriTelefon?.replace(/\D/g, '') ?? ''
      const waLink = waPhone
        ? `https://wa.me/90${waPhone.replace(/^0/, '')}?text=${encodeURIComponent(
            `Merhaba ${siparis.musteriAdi}, ${siparis.urunAdi} siparişiniz teslim edilmiştir. Güven Optik`,
          )}`
        : null

      return res.json({ success: true, data: updated, odooSonuc, waLink })
    } catch (e: any) {
      return res.status(400).json({ error: e?.message ?? 'Teslim kaydedilemedi' })
    }
  },
)

export default router
