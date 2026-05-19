import { apiClient } from './client'
import type { Product } from './types'

export async function getProducts(query?: {
  type?: string
  category?: string
  group?: string
  q?: string
  barcode?: string
}): Promise<Product[]> {
  const res = await apiClient.get('/products', { params: query })
  return res.data
}

export async function getFavorites(): Promise<Product[]> {
  const res = await apiClient.get('/products/favorites')
  return res.data
}

export async function getByBarcode(barcode: string): Promise<Product> {
  const res = await apiClient.get(`/products/by-barcode/${barcode}`)
  return res.data
}

export async function getOdooProducts(category?: string) {
  const params = category ? `?category=${category}` : ''
  const res = await apiClient.get(`/odoo/products${params}`)
  return res.data
}

