/**
 * 13.11.2026 — Satın alma siparişleri (firmadan doğrudan mağazaya ya da depoya).
 * Şimdilik kaynak: min-max eksikleri. Firma ziyareti ekranı ve faturalı girişte siparişle karşılaştırma
 * sonraki adımda bu tabloya bağlanacak.
 */
import { prisma } from '../../database/prisma';
import { execute } from '../odoo/odoo.service';
import { LOKASYON_ID_MAP } from '../odoo/odooLocations';

export type SiparisKalem = { varyantId: number; urunAdi: string; nitelik?: string; adet: number };
export const ACIK_SIPARIS_DURUMLARI = ['TASLAK', 'VERILDI'];

function kalemTemizle(k: SiparisKalem[]): SiparisKalem[] {
  return (Array.isArray(k) ? k : [])
    .map((x) => ({
      varyantId: Number(x.varyantId),
      urunAdi: String(x.urunAdi ?? '').slice(0, 300),
      nitelik: String(x.nitelik ?? '').slice(0, 200),
      adet: Math.max(1, Math.round(Number(x.adet) || 1)),
    }))
    .filter((x) => Number.isInteger(x.varyantId) && x.varyantId > 0);
}

export async function siparisOlustur(g: {
  lokasyon: string;
  tedarikciId?: number | null;
  tedarikciAdi?: string | null;
  kalemler: SiparisKalem[];
  kaynak?: string;
  aciklama?: string;
}, olusturanAdi: string | null) {
  if (!LOKASYON_ID_MAP[g.lokasyon]) throw new Error('Geçerli bir teslim yeri seçin');
  const kalemler = kalemTemizle(g.kalemler);
  if (!kalemler.length) throw new Error('Siparişte en az bir ürün olmalı');
  return prisma.satinAlmaSiparis.create({
    data: {
      lokasyon: g.lokasyon,
      tedarikciId: g.tedarikciId ? Number(g.tedarikciId) : null,
      tedarikciAdi: g.tedarikciAdi?.slice(0, 300) || null,
      kalemler,
      kaynak: ['MINMAX', 'IKMAL', 'ELLE'].includes(String(g.kaynak)) ? String(g.kaynak) : 'MINMAX',
      aciklama: g.aciklama?.slice(0, 500) || null,
      olusturanAdi,
    },
  });
}

export async function siparisListesi(f: { lokasyon?: string; durum?: string }) {
  return prisma.satinAlmaSiparis.findMany({
    where: { ...(f.lokasyon ? { lokasyon: f.lokasyon } : {}), ...(f.durum ? { durum: f.durum } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function siparisDurum(id: string, durum: 'VERILDI' | 'TAMAMLANDI' | 'IPTAL' | 'TASLAK') {
  const s = await prisma.satinAlmaSiparis.findUnique({ where: { id } });
  if (!s) throw new Error('Sipariş bulunamadı');
  if (!['VERILDI', 'TAMAMLANDI', 'IPTAL', 'TASLAK'].includes(durum)) throw new Error('Geçersiz durum');
  return prisma.satinAlmaSiparis.update({
    where: { id },
    data: { durum, ...(durum === 'VERILDI' && !s.verildi ? { verildi: new Date() } : {}) },
  });
}

/** Açık siparişlerde (taslak/verildi, henüz gelmemiş) bekleyen adetler: lokasyon → varyant → adet */
export async function acikSiparisAdetleri(lokasyon: string): Promise<Map<number, number>> {
  const list = await prisma.satinAlmaSiparis.findMany({
    where: { lokasyon, durum: { in: ACIK_SIPARIS_DURUMLARI } },
    select: { kalemler: true },
  });
  const m = new Map<number, number>();
  for (const s of list) {
    for (const k of (s.kalemler as SiparisKalem[]) ?? []) m.set(Number(k.varyantId), (m.get(Number(k.varyantId)) ?? 0) + Number(k.adet ?? 0));
  }
  return m;
}

/** Tedarikçi cariler (Odoo, supplier_rank > 0) — sipariş ekranındaki firma seçimi için. */
export async function tedarikciler(q?: string): Promise<{ id: number; ad: string }[]> {
  const dom: unknown[] = [['supplier_rank', '>', 0], ['active', '=', true]];
  if (q?.trim()) dom.push(['name', 'ilike', q.trim()]);
  const r = (await execute('res.partner', 'search_read', [dom], { fields: ['id', 'name'], limit: 300, order: 'name asc' })) as { id: number; name: string }[];
  return r.map((x) => ({ id: x.id, ad: x.name }));
}
