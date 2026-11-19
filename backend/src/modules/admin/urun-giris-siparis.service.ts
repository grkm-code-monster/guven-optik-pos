/**
 * 14.11.2026 — Ürün Girişi ↔ müşteri siparişi (OzelSiparis) bağı.
 *
 * • bekleyenMusteriSiparisleri(): gelmesi beklenen müşteri siparişleri (POS "stok temin" ile açılanlar),
 *   satılan ürünün Odoo karşılığı ile birlikte — ürün girişinde "Kime?" seçimi için.
 * • girisSonrasiDagit(): ürün girişi BAŞARIYLA kaydedildikten sonra çağrılır:
 *     - siparişe bağlı lotlar → siparişin mağazasına transfer (hemen kabul), karekodlar siparişe yazılır,
 *       sipariş "TESLIM_ALINDI" olur (adet tamamlanınca) ve mağazaya bildirim gider;
 *     - bağsız ama mağaza seçilmiş lotlar → o mağazaya transfer (mağaza kabul eder).
 *   Bu adımdaki hata stok girişini GERİ ALMAZ; sadece raporlanır (stok şirketin ana deposunda kalır).
 */
import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { LOKASYON_ID_MAP, getAnaDepoLocationId } from '../odoo/odooLocations';
import { olusturTransfer } from './transfer-olustur.service';
import { createOzelSiparis, updateOzelSiparisDurum } from '../ozel-siparis/ozel-siparis.service';

const CTX = { context: { active_test: false, allowed_company_ids: ODOO_ALL_COMPANY_IDS } };
/**
 * Dağıtım transferlerinde UTS'yi transfer motoru TAŞIMASIN: bu lotların UTS kabul/aktarımı ürün girişinin
 * UTS adımında (uts-giris.service) kaydın geldiği mağazadan yapılır. Transfer motoru boş olmayan utsKodu
 * görünce lottan okumaz; boşluk (trim → boş) olduğu için UTS adımı "atlandı" olur.
 */
const UTS_TRANSFERDE_ATLA = ' ';
export const BEKLEYEN_SIPARIS_DURUMLARI = ['BEKLIYOR', 'GONDERILDI', 'TEDARIKCIE_GONDERILDI', 'URETIMDE', 'KARGODA'];

export type SiparisAday = {
  id: string;
  musteriAdi: string;
  musteriTelefon: string | null;
  subeId: string | null;
  urunAdi: string;
  miktar: number;
  gelenAdet: number;
  kalan: number;
  durum: string;
  tedarikciAdi: string | null;
  olusturma: string;
  satisTemsilcisi: string | null;
  optikCam: boolean;
  recete: {
    sagSph: number | null; sagCyl: number | null; sagAks: number | null; sagAdd: number | null;
    solSph: number | null; solCyl: number | null; solAks: number | null; solAdd: number | null;
  };
  // Satılan ürünün Odoo karşılığı (varsa satır otomatik eşleşir)
  odooProductId: number | null;
  odooTmplId: number | null;
  odooUrunAdi: string | null;
  odooBarkod: string | null;
  /** 19.11.2026 — son 30 günde ürün girişiyle tamamı gelmiş sipariş (bilgi amaçlı; bağlanamaz) */
  geldi?: boolean;
  girisNo?: string | null;
  girisFaturaNo?: string | null;
  girisTarihi?: string | null;
};

function m2oId(v: unknown): number | null {
  return Array.isArray(v) && typeof v[0] === 'number' ? v[0] : null;
}
function m2oAd(v: unknown): string {
  return Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '';
}

/** 19.11.2026 — Satışta "Cam Bekleniyor" (ORDERED) yapılmış ama özel sipariş kaydı açılmamış kalemler
 *  (stokta görünen cam/çerçeve firmadan istenince). Listeye `kalem:<saleItemId>` id'siyle girer; ürün
 *  girişinde bağlanınca sipariş kaydı otomatik açılır (kalemSiparisleriniAc). Son 180 gün. */
const SIPARISSIZ_GUN = 180;
const HIZMET_KATEGORILERI = [63, 82];
const GELMIS_GUN = 30;

async function siparissizBekleyenKalemler() {
  const kalemler = await prisma.saleItem.findMany({
    where: {
      status: 'ORDERED',
      sale: { status: { notIn: ['DRAFT', 'VOID'] }, createdAt: { gte: new Date(Date.now() - SIPARISSIZ_GUN * 86400000) } },
    },
    select: {
      id: true,
      qty: true,
      odooProductId: true,
      odooProductName: true,
      odooCategoryId: true,
      linkedItemId: true,
      linkType: true,
      product: { select: { category: true, name: true } },
      prescription: { select: { r_sph: true, r_cyl: true, r_aks: true, r_add: true, l_sph: true, l_cyl: true, l_aks: true, l_add: true } },
      sale: { select: { id: true, createdAt: true, branchId: true, customer: { select: { id: true, name: true, phone: true } }, user: { select: { name: true } } } },
    },
    orderBy: { sale: { createdAt: 'desc' } },
    take: 1000,
  });
  const hizmetDisi = kalemler.filter(
    (k) => !(k.odooCategoryId != null && HIZMET_KATEGORILERI.includes(k.odooCategoryId)) && !(k.linkedItemId && !k.linkType),
  );
  if (!hizmetDisi.length) return [];
  const varolan = await prisma.ozelSiparis.findMany({
    where: { saleItemId: { in: hizmetDisi.map((k) => k.id) }, durum: { not: 'IPTAL' } },
    select: { saleItemId: true },
  });
  const sipli = new Set(varolan.map((v) => v.saleItemId));
  const subeler = new Map((await prisma.branch.findMany({ select: { id: true, code: true } })).map((b) => [b.id, b.code]));
  return hizmetDisi.filter((k) => !sipli.has(k.id)).map((k) => ({ ...k, subeKodu: subeler.get(k.sale.branchId) ?? null }));
}

/** Ürün girişinde `kalem:<saleItemId>` ile bağlanan satırlar için özel sipariş kaydını aç; eski id → yeni id */
export async function kalemSiparisleriniAc(ids: string[], userId: string | null): Promise<Map<string, string>> {
  const sonuc = new Map<string, string>();
  const itemIds = [...new Set(ids.filter((x) => x.startsWith('kalem:')).map((x) => x.slice(6)))];
  if (!itemIds.length) return sonuc;
  const kalemler = await prisma.saleItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      qty: true,
      odooProductName: true,
      product: { select: { name: true } },
      prescription: { select: { r_sph: true, r_cyl: true, r_aks: true, r_add: true, l_sph: true, l_cyl: true, l_aks: true, l_add: true } },
      sale: { select: { id: true, branchId: true, customer: { select: { id: true, name: true, phone: true } }, user: { select: { name: true } } } },
    },
  });
  const subeler = new Map((await prisma.branch.findMany({ select: { id: true, code: true } })).map((b) => [b.id, b.code]));
  for (const k of kalemler) {
    const rx = k.prescription;
    const n = (v: unknown) => (v == null || v === '' ? undefined : Number(v));
    const sube = subeler.get(k.sale.branchId) ?? undefined;
    const r = await createOzelSiparis(
      {
        musteriAdi: k.sale.customer?.name || 'Müşteri',
        musteriTelefon: k.sale.customer?.phone ?? '',
        musteriId: k.sale.customer?.id,
        satisSiparisId: k.sale.id,
        saleItemId: k.id,
        subeId: sube,
        subeAdi: sube,
        tip: 'RECETELI',
        urunAdi: k.odooProductName || k.product?.name || 'Ürün',
        miktar: k.qty ?? 1,
        sagSph: n(rx?.r_sph), sagCyl: n(rx?.r_cyl), sagAks: n(rx?.r_aks), sagAdd: n(rx?.r_add),
        solSph: n(rx?.l_sph), solCyl: n(rx?.l_cyl), solAks: n(rx?.l_aks), solAdd: n(rx?.l_add),
        satisTemsilcisi: k.sale.user?.name ?? undefined,
        notlar: 'Ürün girişinde otomatik açıldı (satışta "Cam Bekleniyor" yapılmış, sipariş kaydı yoktu)',
      } as any,
      userId,
    );
    const id = (r as any)?.data?.id ?? (r as any)?.mevcutSiparis?.id;
    if (id) sonuc.set(`kalem:${k.id}`, id);
  }
  return sonuc;
}

export async function bekleyenMusteriSiparisleri(): Promise<SiparisAday[]> {
  const siparisler = await prisma.ozelSiparis.findMany({
    where: { durum: { in: BEKLEYEN_SIPARIS_DURUMLARI } },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });
  const acik = siparisler.filter((s) => (s.gelenAdet ?? 0) < Math.max(1, s.miktar ?? 1));
  // 19.11.2026 — tamamı gelmiş siparişler listeden düşünce "gelmedi" sanılıyordu: son 30 günde gelenleri
  // bilgi olarak (gri, bağlanamaz) ekle; panelde aramada görünür.
  const gelmisler = await prisma.ozelSiparis.findMany({
    where: { urunGirisTarihi: { gte: new Date(Date.now() - GELMIS_GUN * 86400000) }, durum: { not: 'IPTAL' } },
    orderBy: { urunGirisTarihi: 'desc' },
    take: 1000,
  });
  const tamGelen = gelmisler.filter((s) => (s.gelenAdet ?? 0) >= Math.max(1, s.miktar ?? 1));
  const siparissiz = await siparissizBekleyenKalemler().catch((e) => {
    console.error('[bekleyen-siparis] siparişsiz kalemler okunamadı:', e instanceof Error ? e.message : e);
    return [] as Awaited<ReturnType<typeof siparissizBekleyenKalemler>>;
  });
  const itemIds = acik.map((s) => s.saleItemId).filter((x): x is string => !!x);
  const kalemler = itemIds.length
    ? await prisma.saleItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, odooProductId: true, odooProductName: true, product: { select: { category: true } } },
    })
    : [];
  const kalemMap = new Map(kalemler.map((k) => [k.id, k]));

  const pids = [...new Set([...kalemler, ...siparissiz].map((k) => Number(k.odooProductId)).filter((x) => Number.isFinite(x) && x > 0))];
  type P = { id: number; product_tmpl_id: [number, string] | false; display_name: string; barcode: string | false; categ_id: [number, string] | false };
  const urunler = pids.length
    ? ((await execute('product.product', 'read', [pids], { fields: ['id', 'product_tmpl_id', 'display_name', 'barcode', 'categ_id'], ...CTX })) as P[])
    : [];
  const urunMap = new Map(urunler.map((u) => [u.id, u]));

  const sanal: SiparisAday[] = siparissiz.map((k) => {
    const pid = k.odooProductId ? Number(k.odooProductId) : null;
    const u = pid ? urunMap.get(pid) : undefined;
    const kategori = m2oAd(u?.categ_id).toLocaleUpperCase('tr-TR');
    const rx = k.prescription;
    const n = (v: unknown) => (v == null ? null : Number(v));
    const miktar = Math.max(1, k.qty ?? 1);
    return {
      id: `kalem:${k.id}`,
      musteriAdi: k.sale.customer?.name || 'Müşteri',
      musteriTelefon: k.sale.customer?.phone ?? null,
      subeId: k.subeKodu,
      urunAdi: k.odooProductName || k.product?.name || 'Ürün',
      miktar,
      gelenAdet: 0,
      kalan: miktar,
      durum: 'SIPARIS_KAYDI_YOK',
      tedarikciAdi: null,
      olusturma: k.sale.createdAt.toISOString(),
      satisTemsilcisi: k.sale.user?.name ?? null,
      optikCam: k.product?.category === 'LENS_RX' || Boolean(k.linkType) || (kategori.includes('OPTİK CAM') && !kategori.includes('KONTAKT')),
      recete: {
        sagSph: n(rx?.r_sph), sagCyl: n(rx?.r_cyl), sagAks: n(rx?.r_aks), sagAdd: n(rx?.r_add),
        solSph: n(rx?.l_sph), solCyl: n(rx?.l_cyl), solAks: n(rx?.l_aks), solAdd: n(rx?.l_add),
      },
      odooProductId: u ? u.id : null,
      odooTmplId: u ? m2oId(u.product_tmpl_id) : null,
      odooUrunAdi: u ? u.display_name : (k.odooProductName ?? null),
      odooBarkod: u && typeof u.barcode === 'string' && u.barcode.trim() ? u.barcode.trim() : null,
    };
  });

  const gercek: SiparisAday[] = acik.map((s) => {
    const k = s.saleItemId ? kalemMap.get(s.saleItemId) : undefined;
    const pid = k?.odooProductId ? Number(k.odooProductId) : null;
    const u = pid ? urunMap.get(pid) : undefined;
    const kategori = m2oAd(u?.categ_id).toLocaleUpperCase('tr-TR');
    const optikCam = k?.product?.category === 'LENS_RX'
      || (kategori.includes('OPTİK CAM') && !kategori.includes('KONTAKT'));
    const miktar = Math.max(1, s.miktar ?? 1);
    return {
      id: s.id,
      musteriAdi: s.musteriAdi,
      musteriTelefon: s.musteriTelefon ?? null,
      subeId: s.subeId ?? null,
      urunAdi: s.urunAdi,
      miktar,
      gelenAdet: s.gelenAdet ?? 0,
      kalan: miktar - (s.gelenAdet ?? 0),
      durum: s.durum,
      tedarikciAdi: s.tedarikciAdi ?? null,
      olusturma: s.createdAt.toISOString(),
      satisTemsilcisi: s.satisTemsilcisi ?? null,
      optikCam,
      recete: {
        sagSph: s.sagSph, sagCyl: s.sagCyl, sagAks: s.sagAks, sagAdd: s.sagAdd,
        solSph: s.solSph, solCyl: s.solCyl, solAks: s.solAks, solAdd: s.solAdd,
      },
      odooProductId: u ? u.id : null,
      odooTmplId: u ? m2oId(u.product_tmpl_id) : null,
      odooUrunAdi: u ? u.display_name : (k?.odooProductName ?? null),
      odooBarkod: u && typeof u.barcode === 'string' && u.barcode.trim() ? u.barcode.trim() : null,
    };
  });
  const gelmis: SiparisAday[] = tamGelen.map((s) => {
    const miktar = Math.max(1, s.miktar ?? 1);
    return {
      id: s.id,
      musteriAdi: s.musteriAdi,
      musteriTelefon: s.musteriTelefon ?? null,
      subeId: s.subeId ?? null,
      urunAdi: s.urunAdi,
      miktar,
      gelenAdet: s.gelenAdet ?? 0,
      kalan: 0,
      durum: s.durum,
      tedarikciAdi: s.tedarikciAdi ?? null,
      olusturma: s.createdAt.toISOString(),
      satisTemsilcisi: s.satisTemsilcisi ?? null,
      optikCam: false,
      recete: {
        sagSph: s.sagSph, sagCyl: s.sagCyl, sagAks: s.sagAks, sagAdd: s.sagAdd,
        solSph: s.solSph, solCyl: s.solCyl, solAks: s.solAks, solAdd: s.solAdd,
      },
      odooProductId: null,
      odooTmplId: null,
      odooUrunAdi: null,
      odooBarkod: null,
      geldi: true,
      girisNo: s.urunGirisNo ?? null,
      girisFaturaNo: s.urunGirisFaturaNo ?? null,
      girisTarihi: s.urunGirisTarihi ? s.urunGirisTarihi.toISOString() : null,
    };
  });
  // en yeni önce; gelmişler en sonda
  return [...[...gercek, ...sanal].sort((a, b) => b.olusturma.localeCompare(a.olusturma)), ...gelmis];
}

export type GirisLotBilgi = {
  lotId: number | null; // Odoo stock.lot id (bu girişte oluşan)
  productId: number | null; // Odoo product.product id
  lotNo: string;
  utsKodu: string;
  urunAdi: string;
  lokasyon: string;
  lokasyonTip: string;
  siparisId: string | null;
};

export type SiparisBagSonuc = {
  siparisId: string;
  musteriAdi: string;
  subeId: string | null;
  adet: number;
  tamamlandi: boolean;
  transfer: 'YAPILDI' | 'GEREKMEDI' | 'HATA';
  mesaj: string;
};
export type LokasyonTransferSonuc = { lokasyon: string; adet: number; basarili: boolean; mesaj: string };

export async function girisSonrasiDagit(input: {
  cid?: number;
  girisNo: string;
  faturaNo: string;
  userId: string | null;
  lotlar: GirisLotBilgi[];
}): Promise<{ siparisler: SiparisBagSonuc[]; lokasyonlar: LokasyonTransferSonuc[] }> {
  const kaynak = getAnaDepoLocationId(input.cid ?? 1);
  const siparisSonuc: SiparisBagSonuc[] = [];
  const lokasyonSonuc: LokasyonTransferSonuc[] = [];

  // ── 1) Müşteri siparişine bağlı lotlar ──
  const gruplar = new Map<string, GirisLotBilgi[]>();
  for (const l of input.lotlar) {
    if (!l.siparisId) continue;
    const g = gruplar.get(l.siparisId) ?? [];
    g.push(l);
    gruplar.set(l.siparisId, g);
  }
  for (const [siparisId, lotlar] of gruplar) {
    const s = await prisma.ozelSiparis.findUnique({ where: { id: siparisId } });
    if (!s) {
      siparisSonuc.push({ siparisId, musteriAdi: '?', subeId: null, adet: lotlar.length, tamamlandi: false, transfer: 'HATA', mesaj: 'Sipariş bulunamadı' });
      continue;
    }
    const hedefKod = s.subeId ?? '';
    const hedefId = LOKASYON_ID_MAP[hedefKod];
    let transfer: SiparisBagSonuc['transfer'] = 'GEREKMEDI';
    let mesaj = '';
    if (!hedefId) {
      transfer = 'HATA';
      mesaj = `Siparişin mağazası (${hedefKod || 'boş'}) tanımsız — ürün depoda kaldı`;
    } else if (hedefId !== kaynak) {
      const eksik = lotlar.filter((l) => !l.lotId || !l.productId);
      if (eksik.length) {
        transfer = 'HATA';
        mesaj = `${eksik.length} lot Odoo'da bulunamadı — mağazaya transfer yapılamadı, ürün depoda`;
      } else {
        try {
          const r = await olusturTransfer({
            kalemler: lotlar.map((l) => ({
              kaynak,
              hedef: hedefId,
              productId: l.productId!,
              resolvedProductId: l.productId!,
              lotId: l.lotId,
              miktar: 1,
              utsKodu: UTS_TRANSFERDE_ATLA,
              urunAdi: l.urunAdi || s.urunAdi,
            })),
            notlar: `OzelSiparis:${s.id} — ${s.musteriAdi} — Ürün girişi ${input.girisNo}${input.faturaNo ? ` (fatura ${input.faturaNo})` : ''}`,
            hemenKabul: true,
          });
          transfer = r.success ? 'YAPILDI' : 'HATA';
          mesaj = r.success ? `${hedefKod} stoğuna gönderildi` : `Transfer başarısız: ${r.message}`;
        } catch (e) {
          transfer = 'HATA';
          mesaj = `Transfer başarısız: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    } else {
      mesaj = `${hedefKod} stoğuna girdi`;
    }

    // Karekod/lot kayıtları siparişe
    const kodlar = lotlar.map((l) => (l.utsKodu || l.lotNo || '').trim()).filter(Boolean);
    if (kodlar.length) {
      await prisma.ozelSiparisKarekod.createMany({
        data: kodlar.map((karekod) => ({ siparisId: s.id, karekod, tarayanUserId: input.userId })),
      });
    }
    const yeniGelen = (s.gelenAdet ?? 0) + lotlar.length;
    await prisma.ozelSiparis.update({
      where: { id: s.id },
      data: {
        gelenAdet: yeniGelen,
        urunGirisNo: input.girisNo || null,
        urunGirisFaturaNo: input.faturaNo || null,
        urunGirisTarihi: new Date(),
        gercekGelisTarihi: new Date(),
      },
    });
    const tamamlandi = yeniGelen >= Math.max(1, s.miktar ?? 1);
    const not = `Ürün girişi ${input.girisNo}${input.faturaNo ? ` · fatura ${input.faturaNo}` : ''} — ${lotlar.length} adet · ${mesaj}`;
    if (tamamlandi && transfer !== 'HATA') {
      await updateOzelSiparisDurum(s.id, {
        durum: 'TESLIM_ALINDI',
        userId: input.userId,
        notlar: not,
        bildirimGonder: true,
        bildirimOzel: {
          baslik: `Müşteri ürünü geldi — ${s.musteriAdi}`,
          mesaj: `${s.urunAdi} · ${mesaj}`,
        },
      });
    } else {
      await prisma.ozelSiparisLog.create({
        data: { siparisId: s.id, eskiDurum: s.durum, yeniDurum: s.durum, userId: input.userId, notlar: tamamlandi ? not : `Kısmi geliş (${yeniGelen}/${s.miktar}) — ${not}` },
      });
    }
    siparisSonuc.push({ siparisId: s.id, musteriAdi: s.musteriAdi, subeId: s.subeId ?? null, adet: lotlar.length, tamamlandi, transfer, mesaj });
  }

  // ── 2) Bağsız, mağaza seçilmiş lotlar → o mağazaya transfer ──
  const lokGrup = new Map<string, GirisLotBilgi[]>();
  for (const l of input.lotlar) {
    if (l.siparisId) continue;
    if (l.lokasyonTip !== 'sube') continue;
    const hedefId = LOKASYON_ID_MAP[l.lokasyon];
    if (!hedefId || hedefId === kaynak || l.lokasyon === 'ANADEPO') continue;
    const g = lokGrup.get(l.lokasyon) ?? [];
    g.push(l);
    lokGrup.set(l.lokasyon, g);
  }
  for (const [lok, lotlar] of lokGrup) {
    const eksik = lotlar.filter((l) => !l.lotId || !l.productId);
    if (eksik.length) {
      lokasyonSonuc.push({ lokasyon: lok, adet: lotlar.length, basarili: false, mesaj: `${eksik.length} lot Odoo'da bulunamadı — transfer yapılmadı, ürünler depoda` });
      continue;
    }
    try {
      const r = await olusturTransfer({
        kalemler: lotlar.map((l) => ({
          kaynak,
          hedef: LOKASYON_ID_MAP[lok],
          productId: l.productId!,
          resolvedProductId: l.productId!,
          lotId: l.lotId,
          miktar: 1,
          utsKodu: UTS_TRANSFERDE_ATLA,
          urunAdi: l.urunAdi,
        })),
        notlar: `Ürün girişi ${input.girisNo}${input.faturaNo ? ` (fatura ${input.faturaNo})` : ''} → ${lok}`,
      });
      lokasyonSonuc.push({ lokasyon: lok, adet: lotlar.length, basarili: r.success, mesaj: r.success ? `${lok} mağazasına transfer açıldı (mağaza kabul edecek)` : r.message });
    } catch (e) {
      lokasyonSonuc.push({ lokasyon: lok, adet: lotlar.length, basarili: false, mesaj: e instanceof Error ? e.message : String(e) });
    }
  }

  return { siparisler: siparisSonuc, lokasyonlar: lokasyonSonuc };
}
