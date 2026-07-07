import {
  Prisma,
  Role,
  TransferStatus,
  WarrantyResult,
  WarrantyStatus,
  WarrantyType,
  WarrantyExpectedOutcome,
} from '@prisma/client'
import { prisma } from '../../database/prisma'
import type { JwtPayload } from '../auth/auth.types'

function generateClaimNo(): string {
  const year = new Date().getFullYear()
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `GTK-${year}-${rand}`
}

export class WarrantyError extends Error {
  statusCode: number
  code: string

  constructor(statusCode: number, message: string, code = 'WARRANTY_ERROR') {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

const TERMINAL_STATUSES: WarrantyStatus[] = ['RESOLVED', 'OUT_OF_WARRANTY']

const FORWARD_TRANSITIONS: Partial<Record<WarrantyStatus, WarrantyStatus[]>> = {
  OPEN: ['SENT_TO_SUPPLIER'],
  SENT_TO_SUPPLIER: ['IN_RETURN_PROCESS'],
}

function isOutOfWarrantyResult(result: WarrantyResult): boolean {
  return result === 'OUT_OF_WARRANTY_FEE' || result === 'OUT_OF_WARRANTY_REJECTED'
}

function assertAdminPanelRole(user: JwtPayload) {
  if (user.role === Role.SALES_STAFF) {
    throw new WarrantyError(403, 'Bu işlem için yetkiniz yok.', 'FORBIDDEN')
  }
}

function assertRole(user: JwtPayload, ...roles: Role[]) {
  if (!roles.includes(user.role)) {
    throw new WarrantyError(403, 'Bu işlem için yetkiniz yok.', 'FORBIDDEN')
  }
}

async function getClaimOrThrow(id: string) {
  const claim = await prisma.warrantyClaim.findUnique({ where: { id } })
  if (!claim) throw new WarrantyError(404, 'Garanti kaydı bulunamadı.', 'NOT_FOUND')
  return claim
}

function assertBranchAccess(user: JwtPayload, claim: { branchId: string | null }) {
  if (user.role === Role.STORE_MANAGER && claim.branchId !== user.branchId) {
    throw new WarrantyError(403, 'Bu kayda erişim yetkiniz yok.', 'FORBIDDEN')
  }
}

function validateStatusTransition(
  current: WarrantyStatus,
  next: WarrantyStatus,
  isAdmin: boolean,
) {
  if (current === next) return
  if (TERMINAL_STATUSES.includes(current)) {
    throw new WarrantyError(400, 'Tamamlanmış kayıtta durum değiştirilemez.', 'INVALID_TRANSITION')
  }
  const allowedForward = FORWARD_TRANSITIONS[current] ?? []
  if (allowedForward.includes(next)) return
  if (isAdmin) return
  throw new WarrantyError(400, 'Geçersiz durum geçişi.', 'INVALID_TRANSITION')
}

export async function createClaim(input: {
  saleId?: string
  saleItemId?: string
  customerId?: string
  branchId?: string
  userId?: string
  type: WarrantyType
  expectedOutcome?: import('@prisma/client').WarrantyExpectedOutcome
  problemDesc?: string
  productName?: string
  productCategory?: string
  odooCategoryId?: number
  lotNo?: string
  barcode?: string
  internalRef?: string
  supplierName?: string
  chainJson?: string
}) {
  let claimNo = generateClaimNo()
  let attempts = 0
  while (attempts < 5) {
    const existing = await prisma.warrantyClaim.findUnique({ where: { claimNo } })
    if (!existing) break
    claimNo = generateClaimNo()
    attempts++
  }
  return prisma.warrantyClaim.create({
    data: { ...input, claimNo },
    include: { customer: true, saleItem: true, messages: { include: { user: true } } },
  })
}

export async function getClaims(filters: {
  status?: WarrantyStatus
  branchId?: string
  search?: string
}) {
  const where: any = {}
  if (filters.status) where.status = filters.status
  if (filters.branchId) where.branchId = filters.branchId
  if (filters.search) {
    where.OR = [
      { claimNo: { contains: filters.search, mode: 'insensitive' } },
      { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
      { productName: { contains: filters.search, mode: 'insensitive' } },
    ]
  }
  return prisma.warrantyClaim.findMany({
    where,
    include: {
      customer: true,
      user: true,
      messages: { include: { user: true }, orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getClaimsForUser(
  user: JwtPayload,
  filters: {
    status?: WarrantyStatus
    type?: WarrantyType
    branchId?: string
    supplierName?: string
    q?: string
  },
) {
  assertAdminPanelRole(user)

  const where: any = {}

  if (user.role === Role.STORE_MANAGER) {
    where.branchId = user.branchId
  } else if (filters.branchId) {
    where.branchId = filters.branchId
  }

  if (filters.status) where.status = filters.status
  if (filters.type) where.type = filters.type
  if (filters.supplierName) {
    where.supplierName = { equals: filters.supplierName, mode: 'insensitive' }
  }
  if (filters.q) {
    where.OR = [
      { claimNo: { contains: filters.q, mode: 'insensitive' } },
      { barcode: { contains: filters.q, mode: 'insensitive' } },
      { customer: { name: { contains: filters.q, mode: 'insensitive' } } },
    ]
  }

  return prisma.warrantyClaim.findMany({
    where,
    include: {
      customer: true,
      user: true,
      messages: { include: { user: true }, orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getSuppliersSummary(user: JwtPayload) {
  assertRole(user, Role.ADMIN, Role.WAREHOUSE_MANAGER)

  const rows = await prisma.warrantyClaim.groupBy({
    by: ['supplierName'],
    where: {
      supplierName: { not: null },
      status: { notIn: TERMINAL_STATUSES },
    },
    _count: { id: true },
    _min: { returnDeadline: true },
  })

  return rows
    .filter((r) => r.supplierName)
    .map((r) => ({
      supplierName: r.supplierName!,
      openCount: r._count.id,
      nearestDeadline: r._min.returnDeadline,
    }))
    .sort((a, b) => b.openCount - a.openCount)
}

export async function getClaimById(id: string) {
  return prisma.warrantyClaim.findUnique({
    where: { id },
    include: {
      customer: true,
      saleItem: { include: { product: true } },
      user: true,
      messages: { include: { user: true }, orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function updateClaim(
  id: string,
  input: {
    status?: WarrantyStatus
    result?: WarrantyResult
    supplierNote?: string
    supplierName?: string
  },
) {
  return prisma.warrantyClaim.update({
    where: { id },
    data: { ...input, updatedAt: new Date() },
    include: { customer: true, messages: { include: { user: true } } },
  })
}

export async function approveClaim(user: JwtPayload, id: string) {
  assertRole(user, Role.ADMIN)

  const claim = await getClaimOrThrow(id)

  if (!TERMINAL_STATUSES.includes(claim.status)) {
    throw new WarrantyError(400, 'Sonuç girilmeden onaylanamaz', 'RESULT_REQUIRED')
  }
  if (claim.result === 'PENDING') {
    throw new WarrantyError(400, 'Sonuç girilmeden onaylanamaz', 'RESULT_REQUIRED')
  }

  return prisma.warrantyClaim.update({
    where: { id },
    data: {
      adminApprovedAt: new Date(),
      adminApprovedBy: user.userId,
      updatedAt: new Date(),
    },
    include: {
      customer: true,
      user: true,
      messages: { include: { user: true }, orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function updateClaimStatus(
  user: JwtPayload,
  id: string,
  input: {
    status?: WarrantyStatus
    supplierName?: string
    returnBranchId?: string
    cargoTrackingNo?: string
    returnDeadline?: string
    expectedOutcome?: WarrantyExpectedOutcome
  },
) {
  assertAdminPanelRole(user)

  const claim = await getClaimOrThrow(id)
  assertBranchAccess(user, claim)

  if (user.role === Role.STORE_MANAGER) {
    if (claim.status !== 'OPEN' || claim.userId !== user.userId) {
      throw new WarrantyError(403, 'Bu kaydı güncelleyemezsiniz.', 'FORBIDDEN')
    }
    if (input.status && input.status !== 'OPEN') {
      throw new WarrantyError(403, 'Mağaza müdürü tedarikçiye gönderim yapamaz.', 'FORBIDDEN')
    }
  } else {
    assertRole(user, Role.ADMIN, Role.WAREHOUSE_MANAGER)
  }

  const nextStatus = input.status ?? claim.status
  validateStatusTransition(claim.status, nextStatus, user.role === Role.ADMIN)

  if (nextStatus === 'SENT_TO_SUPPLIER') {
    const supplierName = input.supplierName ?? claim.supplierName
    const returnBranchId = input.returnBranchId ?? claim.returnBranchId
    if (!supplierName || !returnBranchId) {
      throw new WarrantyError(400, 'Tedarikçi ve iade şubesi seçilmelidir.', 'VALIDATION_ERROR')
    }
  }

  if (nextStatus === 'IN_RETURN_PROCESS') {
    const cargoTrackingNo = input.cargoTrackingNo ?? claim.cargoTrackingNo
    if (!cargoTrackingNo) {
      throw new WarrantyError(400, 'Kargo takip numarası girilmelidir.', 'VALIDATION_ERROR')
    }
  }

  return prisma.warrantyClaim.update({
    where: { id },
    data: {
      status: nextStatus,
      supplierName: input.supplierName ?? claim.supplierName,
      returnBranchId: input.returnBranchId ?? claim.returnBranchId,
      cargoTrackingNo: input.cargoTrackingNo ?? claim.cargoTrackingNo,
      returnDeadline: input.returnDeadline ? new Date(input.returnDeadline) : claim.returnDeadline,
      ...(input.expectedOutcome !== undefined ? { expectedOutcome: input.expectedOutcome } : {}),
      updatedAt: new Date(),
    },
    include: {
      customer: true,
      user: true,
      messages: { include: { user: true }, orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function updateClaimResult(
  user: JwtPayload,
  id: string,
  input: {
    result: WarrantyResult
    problemDesc?: string
    expectedOutcome?: WarrantyExpectedOutcome
    refundAmount?: number | string
    refundMethod?: string
  },
) {
  assertRole(user, Role.ADMIN, Role.WAREHOUSE_MANAGER)

  const claim = await getClaimOrThrow(id)

  if (input.result === 'REFUNDED' || input.result === 'RESTOCKED') {
    if (claim.type !== WarrantyType.SATISFACTION_RETURN) {
      throw new WarrantyError(400, 'Bu sonuç yalnızca memnuniyet iadesi kayıtları için geçerlidir.', 'INVALID_RESULT')
    }
    if (!claim.managerApprovedAt) {
      throw new WarrantyError(400, 'Önce depo yöneticisi onayı gerekli', 'MANAGER_APPROVAL_REQUIRED')
    }
    if (input.result === 'REFUNDED') {
      if (input.refundAmount == null || input.refundAmount === '' || !input.refundMethod?.trim()) {
        throw new WarrantyError(400, 'İade tutarı ve yöntemi zorunludur.', 'VALIDATION_ERROR')
      }
    }
  }

  const nextStatus: WarrantyStatus = isOutOfWarrantyResult(input.result)
    ? 'OUT_OF_WARRANTY'
    : 'RESOLVED'

  const data: Prisma.WarrantyClaimUpdateInput = {
    result: input.result,
    problemDesc: input.problemDesc ?? claim.problemDesc,
    status: nextStatus,
    ...(input.expectedOutcome !== undefined ? { expectedOutcome: input.expectedOutcome } : {}),
    updatedAt: new Date(),
  }

  if (input.result === 'REFUNDED') {
    data.refundAmount = new Prisma.Decimal(String(input.refundAmount))
    data.refundMethod = input.refundMethod!.trim()
  }

  return prisma.warrantyClaim.update({
    where: { id },
    data,
    include: {
      customer: true,
      user: true,
      messages: { include: { user: true }, orderBy: { createdAt: 'asc' } },
    },
  })
}

function assertSatisfactionReturn(claim: { type: WarrantyType }) {
  if (claim.type !== WarrantyType.SATISFACTION_RETURN) {
    throw new WarrantyError(400, 'Bu işlem yalnızca memnuniyet iadesi kayıtları için geçerlidir.', 'INVALID_TYPE')
  }
}

export async function startClaimTransfer(
  user: JwtPayload,
  id: string,
  input: { transferSourceBranchId: string },
) {
  assertRole(user, Role.ADMIN, Role.WAREHOUSE_MANAGER)

  const claim = await getClaimOrThrow(id)
  assertSatisfactionReturn(claim)

  if (!input.transferSourceBranchId?.trim()) {
    throw new WarrantyError(400, 'Kaynak şube seçilmelidir.', 'VALIDATION_ERROR')
  }

  return prisma.warrantyClaim.update({
    where: { id },
    data: {
      transferSourceBranchId: input.transferSourceBranchId.trim(),
      transferStatus: TransferStatus.PENDING,
      updatedAt: new Date(),
    },
    include: {
      customer: true,
      user: true,
      messages: { include: { user: true }, orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function completeClaimTransfer(
  user: JwtPayload,
  id: string,
  input: { odooPickingId?: string },
) {
  assertRole(user, Role.ADMIN, Role.WAREHOUSE_MANAGER)

  const claim = await getClaimOrThrow(id)
  assertSatisfactionReturn(claim)

  return prisma.warrantyClaim.update({
    where: { id },
    data: {
      transferStatus: TransferStatus.COMPLETED,
      ...(input.odooPickingId !== undefined ? { odooPickingId: input.odooPickingId || null } : {}),
      updatedAt: new Date(),
    },
    include: {
      customer: true,
      user: true,
      messages: { include: { user: true }, orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function managerApproveClaim(user: JwtPayload, id: string) {
  assertRole(user, Role.WAREHOUSE_MANAGER)

  const claim = await getClaimOrThrow(id)
  assertSatisfactionReturn(claim)

  if (claim.transferStatus !== TransferStatus.COMPLETED) {
    throw new WarrantyError(400, 'Önce transfer tamamlanmalı', 'TRANSFER_NOT_COMPLETED')
  }

  return prisma.warrantyClaim.update({
    where: { id },
    data: {
      managerApprovedAt: new Date(),
      managerApprovedBy: user.userId,
      updatedAt: new Date(),
    },
    include: {
      customer: true,
      user: true,
      messages: { include: { user: true }, orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function addMessage(claimId: string, userId: string, message: string) {
  return prisma.warrantyMessage.create({
    data: { claimId, userId, message },
    include: { user: true },
  })
}

export async function addMessageForUser(user: JwtPayload, claimId: string, message: string) {
  assertRole(user, Role.ADMIN, Role.WAREHOUSE_MANAGER, Role.STORE_MANAGER)

  const claim = await getClaimOrThrow(claimId)
  assertBranchAccess(user, claim)

  return addMessage(claimId, user.userId, message)
}

export async function getStats() {
  const [open, sent, resolved, outOfWarranty] = await Promise.all([
    prisma.warrantyClaim.count({ where: { status: 'OPEN' } }),
    prisma.warrantyClaim.count({ where: { status: 'SENT_TO_SUPPLIER' } }),
    prisma.warrantyClaim.count({ where: { status: 'RESOLVED' } }),
    prisma.warrantyClaim.count({ where: { status: 'OUT_OF_WARRANTY' } }),
  ])
  return { open, sent, resolved, outOfWarranty }
}
