/**
 * 18.11.2026 — "Müşteri Satış Detayları" (Satışlar menüsü)
 *
 * Personel ürünleri bizim isimlerimizle satıyor; garanti/firma görüşmesinde "aslında hangi
 * firmanın hangi ürünü" bilinmiyordu. Bu servis her satış kalemine firma tarafını ekler —
 * personelden ek giriş istemeden, sistemde zaten olan kayıtlardan:
 *   1) Özel sipariş (OzelSiparis.saleItemId): firma, firma ürün adı (depo "Firma Ürünü"),
 *      firma sipariş no, ürün girişi fatura no/tarihi, UTS karekodları, sipariş durumu.
 *   2) Stoktan satılan lot/seri: Odoo'da o lotun geldiği giriş (stock.move.line, incoming):
 *      firma (picking partner), giriş belgesi ve tarihi.
 *   3) Firmanın faturadaki ürün adı: Ürün Girişi "Bu mu?" hafızası (TedarikciUrunEslesme,
 *      ürünümüz ↔ firmanın ürün adı/kodu).
 * MALİYET DÖNMEZ (personel maliyet görmez).
 */
import { ItemStatus, SaleStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { execute } from '../odoo/odoo.service';
import { loadOdooCategoryPaths } from '../reports/report.service';

const AZAMI_KALEM = 3000;

function parcala<T>(a: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
  return r;
}

function fold(s: string | null | undefined): string {
  return String(s ?? '')
    .toLocaleUpperCase('tr-TR')
    .replace(/[^A-Z0-9ÇĞİÖŞÜ]+/g, ' ')
    .trim();
}

function sayiStr(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

type LotGiris = { firma: string | null; belge: string | null; tarih: string | null };

/** Satılan lot/serilerin Odoo'daki giriş kaydı (firma + belge + tarih). Hata olursa boş döner. */
async function lotGirisleri(kalemler: Array<{ odooProductId: string | null; lotNo: string | null }>): Promise<Map<string, LotGiris>> {
  const sonuc = new Map<string, LotGiris>();
  const ciftler = kalemler
    .map((k) => ({ pid: Number(k.odooProductId), lot: String(k.lotNo ?? '').trim() }))
    .filter((k) => Number.isFinite(k.pid) && k.pid > 0 && k.lot);
  if (!ciftler.length) return sonuc;
  try {
    const lotIdToKey = new Map<number, string>();
    for (const p of parcala(ciftler, 150)) {
      const lots = (await execute(
        'stock.lot',
        'search_read',
        [[['name', 'in', [...new Set(p.map((x) => x.lot))]], ['product_id', 'in', [...new Set(p.map((x) => x.pid))]]]],
        { fields: ['id', 'name', 'product_id'], context: { active_test: false } },
      )) as Array<{ id: number; name: string; product_id: [number, string] | false }>;
      for (const l of lots) if (l.product_id) lotIdToKey.set(l.id, `${l.product_id[0]}|${l.name}`);
    }
    const lotIds = [...lotIdToKey.keys()];
    for (const p of parcala(lotIds, 200)) {
      const satirlar = (await execute(
        'stock.move.line',
        'search_read',
        [[['lot_id', 'in', p], ['picking_code', '=', 'incoming'], ['state', '=', 'done']]],
        { fields: ['lot_id', 'picking_id', 'picking_partner_id', 'date'], order: 'date asc' },
      )) as Array<{ lot_id: [number, string] | false; picking_id: [number, string] | false; picking_partner_id: [number, string] | false; date: string }>;
      for (const s of satirlar) {
        const key = s.lot_id ? lotIdToKey.get(s.lot_id[0]) : undefined;
        if (!key || sonuc.has(key)) continue; // ilk giriş
        sonuc.set(key, {
          firma: s.picking_partner_id ? s.picking_partner_id[1] : null,
          belge: s.picking_id ? s.picking_id[1] : null,
          tarih: s.date ? String(s.date).slice(0, 10) : null,
        });
      }
    }
  } catch (e) {
    console.error('[musteri-satis-detay] lot giriş bilgisi okunamadı:', e instanceof Error ? e.message : e);
  }
  return sonuc;
}

export async function getMusteriSatisDetaylari(params: {
  branchId: string | null; // null = tüm şubeler
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}) {
  const q = String(params.q ?? '').trim();
  // Satışlar sayfasıyla aynı kural: müşteri/satış no araması tüm şubelerde yapılır.
  const where: any = q || params.branchId === null ? {} : { branchId: params.branchId };
  where.status = { notIn: [SaleStatus.DRAFT, SaleStatus.VOID] };
  if (params.dateFrom || params.dateTo) {
    where.createdAt = {};
    if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom);
    if (params.dateTo) where.createdAt.lte = new Date(params.dateTo);
  }
  if (q) {
    where.OR = [
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { customer: { phone: { contains: q, mode: 'insensitive' } } },
      { referansNo: { contains: q, mode: 'insensitive' } },
      { id: { contains: q, mode: 'insensitive' } },
    ];
  }

  const kalemler = await prisma.saleItem.findMany({
    where: { status: { not: ItemStatus.VOID }, sale: where },
    select: {
      id: true,
      saleId: true,
      odooProductId: true,
      odooProductName: true,
      odooCategoryId: true,
      lotNo: true,
      qty: true,
      lineTotal: true,
      status: true,
      linkedItemId: true,
      linkType: true,
      maintenanceNature: true,
      maintenanceDescription: true,
      deliveryDate: true,
      product: { select: { name: true } },
      prescription: {
        select: { prescriptionType: true, r_sph: true, r_cyl: true, r_aks: true, r_add: true, l_sph: true, l_cyl: true, l_aks: true, l_add: true },
      },
      sale: {
        select: {
          id: true,
          referansNo: true,
          createdAt: true,
          branchId: true,
          customer: { select: { id: true, name: true, phone: true } },
          user: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ sale: { createdAt: 'desc' } }],
    take: AZAMI_KALEM + 1,
  });
  const kesildi = kalemler.length > AZAMI_KALEM;
  if (kesildi) kalemler.length = AZAMI_KALEM;

  const ids = kalemler.map((k) => k.id);
  const [subeler, siparisler, kategoriYollari, lotlar] = await Promise.all([
    prisma.branch.findMany({
      where: { id: { in: [...new Set(kalemler.map((k) => k.sale.branchId))] } },
      select: { id: true, name: true, code: true },
    }),
    ids.length
      ? prisma.ozelSiparis.findMany({
          where: { saleItemId: { in: ids } },
          select: {
            saleItemId: true,
            tedarikciAdi: true,
            firmaUrunu: true,
            urunAdi: true,
            tedarikciSiparisNo: true,
            urunGirisFaturaNo: true,
            urunGirisTarihi: true,
            gercekGelisTarihi: true,
            durum: true,
            createdAt: true,
            karekodlar: { select: { karekod: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    loadOdooCategoryPaths(kalemler.map((k) => k.odooCategoryId)),
    lotGirisleri(kalemler),
  ]);
  const subeMap = new Map(subeler.map((b) => [b.id, b]));
  const siparisMap = new Map<string, (typeof siparisler)[number]>();
  for (const s of siparisler) if (s.saleItemId && !siparisMap.has(s.saleItemId)) siparisMap.set(s.saleItemId, s);

  // Firmanın ürün adı hafızası (Ürün Girişi "Bu mu?")
  const urunIds = [...new Set(kalemler.map((k) => Number(k.odooProductId)).filter((n) => Number.isFinite(n) && n > 0))];
  const eslesmeler = urunIds.length
    ? await prisma.tedarikciUrunEslesme.findMany({
        where: { odooProductId: { in: urunIds } },
        select: { odooProductId: true, tedarikciAdi: true, tedarikciKey: true, tedarikciUrunAdi: true, tedarikciKodu: true, sonKullanim: true },
        orderBy: { sonKullanim: 'desc' },
      })
    : [];
  const eslesmeMap = new Map<number, typeof eslesmeler>();
  for (const e of eslesmeler) {
    if (e.odooProductId == null) continue;
    const l = eslesmeMap.get(e.odooProductId) ?? [];
    l.push(e);
    eslesmeMap.set(e.odooProductId, l);
  }

  const satirlar = kalemler.map((k) => {
    const sip = siparisMap.get(k.id);
    const lot = k.lotNo && k.odooProductId ? lotlar.get(`${Number(k.odooProductId)}|${String(k.lotNo).trim()}`) : undefined;
    const firma = sip?.tedarikciAdi || lot?.firma || null;
    // Firma ürün adı: önce depoda girilen "Firma Ürünü", yoksa o firmanın fatura adı hafızası
    let firmaUrunAdi: string | null = sip?.firmaUrunu?.trim() || null;
    let firmaUrunKodu: string | null = null;
    let firmaUrunKaynak: 'SIPARIS' | 'FATURA_HAFIZASI' | null = firmaUrunAdi ? 'SIPARIS' : null;
    if (!firmaUrunAdi) {
      const adaylar = eslesmeMap.get(Number(k.odooProductId)) ?? [];
      const f = fold(firma);
      const uygun =
        (f && adaylar.find((a) => fold(a.tedarikciAdi).includes(f) || f.includes(fold(a.tedarikciAdi)) || fold(a.tedarikciKey) === f)) ||
        (adaylar.length === 1 ? adaylar[0] : undefined);
      if (uygun) {
        firmaUrunAdi = uygun.tedarikciUrunAdi;
        firmaUrunKodu = uygun.tedarikciKodu ?? null;
        firmaUrunKaynak = 'FATURA_HAFIZASI';
      }
    }
    const rx = k.prescription;
    const recete = rx
      ? `Sağ ${sayiStr(rx.r_sph)} ${sayiStr(rx.r_cyl)} x${rx.r_aks ?? '—'}${rx.r_add != null ? ` Add ${sayiStr(rx.r_add)}` : ''} · Sol ${sayiStr(rx.l_sph)} ${sayiStr(rx.l_cyl)} x${rx.l_aks ?? '—'}${rx.l_add != null ? ` Add ${sayiStr(rx.l_add)}` : ''}`
      : null;
    const sube = subeMap.get(k.sale.branchId);
    const urunAdi = k.odooProductName || (k.product?.name && !k.product.name.includes('PLACEHOLDER') ? k.product.name : null) || 'Ürün';
    return {
      id: k.id,
      saleId: k.saleId,
      satisNo: k.sale.referansNo ?? k.saleId.slice(-12),
      tarih: k.sale.createdAt,
      sube: sube ? sube.code || sube.name : null,
      subeId: k.sale.branchId,
      personel: k.sale.user?.name ?? null,
      musteri: k.sale.customer?.name ?? null,
      musteriTelefon: k.sale.customer?.phone ?? null,
      musteriId: k.sale.customer?.id ?? null,
      urunAdi,
      kategori: k.odooCategoryId != null ? kategoriYollari.get(k.odooCategoryId) ?? null : null,
      odooCategoryId: k.odooCategoryId,
      adet: k.qty,
      tutar: Number(k.lineTotal),
      kalemDurum: k.status,
      teslimTarihi: k.deliveryDate,
      recete,
      receteTipi: rx?.prescriptionType ?? null,
      lotNo: k.lotNo,
      linkedItemId: k.linkedItemId,
      linkType: k.linkType,
      nitelik: k.maintenanceNature,
      aciklama: k.maintenanceDescription,
      firma,
      firmaUrunAdi,
      firmaUrunKodu,
      firmaUrunKaynak,
      firmaSiparisNo: sip?.tedarikciSiparisNo ?? null,
      siparisDurum: sip?.durum ?? null,
      siparisTarihi: sip?.createdAt ?? null,
      faturaNo: sip?.urunGirisFaturaNo ?? null,
      gelisTarihi: sip?.urunGirisTarihi ?? sip?.gercekGelisTarihi ?? (lot?.tarih ? new Date(lot.tarih) : null),
      girisBelgesi: lot?.belge ?? null,
      karekodlar: sip?.karekodlar?.map((x) => x.karekod) ?? [],
    };
  });

  return { satirlar, kesildi, azami: AZAMI_KALEM };
}
