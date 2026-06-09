import { prisma } from '../../database/prisma'
import { WarrantyStatus, WarrantyType, WarrantyExpectedOutcome } from '@prisma/client'

function generateClaimNo(): string {
  const year = new Date().getFullYear()
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `GTK-${year}-${rand}`
}

export async function createClaim(input: {
  saleId?: string
  saleItemId?: string
  customerId?: string
  branchId?: string
  userId?: string
  type: WarrantyType
  expectedOutcome?: WarrantyExpectedOutcome
  problemDesc?: string
  productName?: string
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
    include: { customer: true, saleItem: true, messages: { include: { user: true } } }
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
    include: { customer: true, user: true, messages: { include: { user: true }, orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' }
  })
}

export async function getClaimById(id: string) {
  return prisma.warrantyClaim.findUnique({
    where: { id },
    include: { customer: true, saleItem: { include: { product: true } }, user: true, messages: { include: { user: true }, orderBy: { createdAt: 'asc' } } }
  })
}

export async function updateClaim(id: string, input: {
  status?: WarrantyStatus
  result?: any
  supplierNote?: string
  supplierName?: string
}) {
  return prisma.warrantyClaim.update({
    where: { id },
    data: { ...input, updatedAt: new Date() },
    include: { customer: true, messages: { include: { user: true } } }
  })
}

export async function addMessage(claimId: string, userId: string, message: string) {
  return prisma.warrantyMessage.create({
    data: { claimId, userId, message },
    include: { user: true }
  })
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
