import { Router, type Request, type Response, type NextFunction } from 'express'
import { authenticate } from '../../middleware/authenticate'
import * as warrantyService from './warranty.service'
import { WarrantyError } from './warranty.service'

const router = Router()
router.use(authenticate)

function handleWarrantyRoute(
  handler: (req: Request, res: Response) => Promise<unknown>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await handler(req, res)
      if (result !== undefined) res.json(result)
    } catch (e) {
      if (e instanceof WarrantyError) {
        res.status(e.statusCode).json({ error: e.code, message: e.message })
        return
      }
      next(e)
    }
  }
}

router.get('/claims/suppliers-summary', handleWarrantyRoute(async (req) => {
  return warrantyService.getSuppliersSummary(req.user!)
}))

router.get('/claims', handleWarrantyRoute(async (req) => {
  const { status, type, branchId, supplierName, q } = req.query
  return warrantyService.getClaimsForUser(req.user!, {
    status: status as any,
    type: type as any,
    branchId: branchId as string,
    supplierName: supplierName as string,
    q: q as string,
  })
}))

router.patch('/claims/:id/approve', handleWarrantyRoute(async (req) => {
  return warrantyService.approveClaim(req.user!, req.params.id)
}))

router.patch('/claims/:id/status', handleWarrantyRoute(async (req) => {
  return warrantyService.updateClaimStatus(req.user!, req.params.id, req.body)
}))

router.patch('/claims/:id/result', handleWarrantyRoute(async (req) => {
  return warrantyService.updateClaimResult(req.user!, req.params.id, req.body)
}))

router.post('/claims/:id/transfer', handleWarrantyRoute(async (req) => {
  const { transferSourceBranchId } = req.body
  return warrantyService.startClaimTransfer(req.user!, req.params.id, { transferSourceBranchId })
}))

router.patch('/claims/:id/transfer/complete', handleWarrantyRoute(async (req) => {
  const { odooPickingId } = req.body ?? {}
  return warrantyService.completeClaimTransfer(req.user!, req.params.id, { odooPickingId })
}))

router.patch('/claims/:id/manager-approve', handleWarrantyRoute(async (req) => {
  return warrantyService.managerApproveClaim(req.user!, req.params.id)
}))

router.post('/claims/:id/messages', handleWarrantyRoute(async (req) => {
  const { message } = req.body
  return warrantyService.addMessageForUser(req.user!, req.params.id, message)
}))

router.get('/stats', async (req, res, next) => {
  try { res.json(await warrantyService.getStats()) } catch (e) { next(e) }
})

router.get('/', async (req, res, next) => {
  try {
    const { status, branchId, search } = req.query
    res.json(await warrantyService.getClaims({
      status: status as any,
      branchId: branchId as string,
      search: search as string,
    }))
  } catch (e) { next(e) }
})

router.get('/:id', async (req, res, next) => {
  try { res.json(await warrantyService.getClaimById(req.params.id)) } catch (e) { next(e) }
})

router.post('/', async (req, res, next) => {
  try { res.json(await warrantyService.createClaim({ ...req.body, userId: req.user?.userId })) } catch (e) { next(e) }
})

router.patch('/:id', async (req, res, next) => {
  try { res.json(await warrantyService.updateClaim(req.params.id, req.body)) } catch (e) { next(e) }
})

router.post('/:id/messages', async (req, res, next) => {
  try {
    const { message } = req.body
    res.json(await warrantyService.addMessage(req.params.id, req.user!.userId, message))
  } catch (e) { next(e) }
})

export default router
