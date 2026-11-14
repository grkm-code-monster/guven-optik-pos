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
import { updateOzelSiparisDurum } from '../ozel-siparis/ozel-siparis.service';

const CTX = { context: { active_test: false, allowed_company_ids: ODOO_ALL_COMPANY_IDS } };
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
};

function m2oId(v: unknown): number | null {
  return Array.isArray(v) && typeof v[0] === 'number' ? v[0] : null;
}
function m2oAd(v: unknown): string {
  return Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '';
}

export async function bekleyenMusteriSiparisleri(): Promise<SiparisAday[]> {
  const siparisler = await prisma.ozelSiparis.findMany({
    where: { durum: { in: BEKLEYEN_SIPARIS_DURUMLARI } },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });
  const acik = siparisler.filter((s) => (s.gelenAdet ?? 0) < Math.max(1, s.miktar ?? 1));
  const itemIds = acik.map((s) => s.saleItemId).filter((x): x is string => !!x);
  const kalemler = itemIds.length
    ? await prisma.saleItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, odooProductId: true, odooProductName: true, product: { select: { category: true } } },
    })
    : [];
  const kalemMap = new Map(kalemler.map((k) => [k.id, k]));

  const pids = [...new Set(kalemler.map((k) => Number(k.odooProductId)).filter((x) => Number.isFinite(x) && x > 0))];
  type P = { id: number; product_tmpl_id: [number, string] | false; display_name: string; barcode: string | false; categ_id: [number, string] | false };
  const urunler = pids.length
    ? ((await execute('product.product', 'read', [pids], { fields: ['id', 'product_tmpl_id', 'display_name', 'barcode', 'categ_id'], ...CTX })) as P[])
    : [];
  const urunMap = new Map(urunler.map((u) => [u.id, u]));

  return acik.map((s) => {
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
