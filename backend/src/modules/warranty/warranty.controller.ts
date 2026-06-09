import { Router, type Request, type Response, type NextFunction } from 'express'
import { authenticate } from '../../middleware/authenticate'
import * as warrantyService from './warranty.service'

const router = Router()
router.use(authenticate)

router.get('/stats', async (req, res, next) => {
  try { res.json(await warrantyService.getStats()) } catch(e) { next(e) }
})

router.get('/', async (req, res, next) => {
  try {
    const { status, branchId, search } = req.query
    res.json(await warrantyService.getClaims({
      status: status as any,
      branchId: branchId as string,
      search: search as string,
    }))
  } catch(e) { next(e) }
})

router.get('/:id', async (req, res, next) => {
  try { res.json(await warrantyService.getClaimById(req.params.id)) } catch(e) { next(e) }
})

router.post('/', async (req, res, next) => {
  try { res.json(await warrantyService.createClaim({ ...req.body, userId: req.user?.userId })) } catch(e) { next(e) }
})

router.patch('/:id', async (req, res, next) => {
  try { res.json(await warrantyService.updateClaim(req.params.id, req.body)) } catch(e) { next(e) }
})

router.post('/:id/messages', async (req, res, next) => {
  try {
    const { message } = req.body
    res.json(await warrantyService.addMessage(req.params.id, req.user!.userId, message))
  } catch(e) { next(e) }
})

export default router
