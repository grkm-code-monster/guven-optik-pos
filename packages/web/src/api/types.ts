export interface User {
  id: string
  name: string
  username: string
  role: 'SALES_STAFF' | 'STORE_MANAGER' | 'WAREHOUSE_MANAGER' | 'WORKSHOP_STAFF' | 'REGIONAL_MANAGER' | 'ACCOUNTANT' | 'ADMIN'
  branchId: string
  branchCode?: string
  canWorkAtolye?: boolean
}

export interface Customer {
  id: string
  name: string
  phone: string
  note?: string
  adres?: string
  il?: string
  ilce?: string
  identityNo?: string
  birthDate?: string
  ePostaEmail?: string
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
  referansNo?: string | null
}

export interface Sale {
  id: string
  customerId: string
  userId?: string
  status: 'DRAFT' | 'PAID' | 'ORDERED' | 'IN_LAB' | 'READY' | 'DELIVERED' | 'VOID'
  createdAt?: string
  grossTotal: string
  discountTotal: string
  netTotal: string
  taxTotal: string
  itemsCount?: number
  customer?: Customer
  user?: { name: string }
  items?: SaleItem[]
  payments?: Payment[]
  referansNo?: string | null
  odooSaleOrderId?: number | null
  draftMeta?: Record<string, unknown> | null
  eFaturaId?: string | null
  eFaturaDurum?: string | null
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
  taxRate?: string | null
  lineTotal: string
  status: string
  linkType?: string | null
  linkedItemId?: string | null
  pairedItemId?: string | null
  prescription?: Prescription
  frames?: Frame[]
  lensOrderMeasurement?: Record<string, unknown> | null
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
  netCiro?: string
  kasaNakit?: string
  toplamBanka?: string
  toplamSgkHakki?: string
  toplamVakifOdemesi?: string
  ortalamaSepet?: string
  satisAdedi?: number
  kategoriBreakdown?: {
    GUNES_GOZLUGU: number
    CAM: number
    LENS: number
    OPTIK_CERCEVE: number
    AKSESUAR: number
    SOLUSYON: number
    DIGER?: number
  }
  temsilciBreakdown?: Array<{
    repName: string
    saleCount: number
    ciro: string
    aylikHedef?: number
  }>
  kampanyaBreakdown?: Array<{ type: string; count: number }>
  transferTotal?: string
  openAccountTotal?: string
  cashIn?: string
  cashOut?: string
  advanceTotal?: string
  totalCommission?: string
  cardGross?: string
  cardNet?: string
  totalDiscount?: string
  salesDetail?: Array<{
    tip?: 'MASRAF' | 'SATIS'
    saleId: string
    createdAt: string
    deliveryDate: string | null
    customerName: string
    grossTotal: string
    netTotal: string
    taxExcluded: string
    discountPct: string
    sgkAmount: string
    repName: string
    cashAmount: string
    cardPayments: Array<{
      bankName: string
      installment: number
      grossAmount: string
      commissionAmount: string
    }>
    transferAmount: string
    itemSummary: string
  }>
  labIncidents?: {
    toplam: number
    lensBroken: number
    frameBroken: number
    measurementShift: number
    kayitlar: Array<{
      id: string
      saat: string
      saleId: string | null
      musteriAdi: string
      incidentType: string
      resolutionType: string | null
      transferRef: string | null
      ozelSiparisId: string | null
    }>
  }
}

export interface BankBreakdown {
  bankName: string
  installment: number
  gross: string
  commission: string
  net: string
}

