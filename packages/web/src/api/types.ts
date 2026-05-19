export interface User {
  id: string
  name: string
  username: string
  role: 'SALES_STAFF' | 'STORE_MANAGER' | 'REGIONAL_MANAGER' | 'ACCOUNTANT' | 'ADMIN'
  branchId: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  note?: string
}

export interface Product {
  id: string
  barcode?: string
  name: string
  productType: 'READY' | 'PRESCRIBED'
  category: string
  group?: string
  price: string
  taxRate: string
  brand?: string
  model?: string
}

export interface Sale {
  id: string
  customerId: string
  status: 'DRAFT' | 'PAID' | 'ORDERED' | 'IN_LAB' | 'READY' | 'DELIVERED' | 'VOID'
  createdAt?: string
  grossTotal: string
  discountTotal: string
  netTotal: string
  taxTotal: string
  customer?: Customer
  items?: SaleItem[]
  payments?: Payment[]
}

export interface SaleItem {
  id: string
  productId: string
  odooProductName?: string | null
  odooProductId?: string | null
  odooCategoryId?: number | null
  qty: number
  unitPrice: string
  discount: string
  taxAmount: string
  lineTotal: string
  status: string
  prescription?: Prescription
  frames?: Frame[]
  product?: Product
}

export interface Prescription {
  prescriptionType: string
  r_pd?: number
  r_sph?: number
  r_cyl?: number
  r_aks?: number
  r_add?: number
  l_pd?: number
  l_sph?: number
  l_cyl?: number
  l_aks?: number
  l_add?: number
  near_r_sph?: number
  near_l_sph?: number
}

export interface Frame {
  id: string
  barcode?: string
  brand?: string
  model?: string
  h?: number
  cap?: number
  vertex?: number
  pantos?: number
  frameAngle?: number
}

export interface Payment {
  id: string
  paymentType: 'CASH' | 'CARD' | 'TRANSFER' | 'OPEN_ACCOUNT'
  grossAmount: string
  commissionAmount?: string
  netAmount: string
  bankId?: string
  installment?: number
}

export interface DailyReport {
  date: string
  branchName: string
  openCash: string
  totalSales: string
  totalNet: string
  totalCommission: string
  cashTotal: string
  cardGross: string
  cardNet: string
  taxTotal: string
  expectedCash: string
  physicalCash?: string
  diff?: string
  saleCount: number
  bankBreakdown: BankBreakdown[]
}

export interface BankBreakdown {
  bankName: string
  installment: number
  gross: string
  commission: string
  net: string
}

