/**
 * 17.11.2026 — Hazır Raporlar uç noktaları (/api/admin/hazir-raporlar/*).
 * Erişim: admin router'ındaki kural tablosu — bu yol için ayrı kural olmadığından sadece ADMIN.
 * Maliyet / kâr sütunları sadece ADMIN ve WAREHOUSE_MANAGER rolüne gönderilir.
 */
import { Router, type Request, type Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { excelUret } from './excel';
import { RAPORLAR, RAPOR_MAP } from './kayit';
import { ODEME_ADI, STOK_LOKASYONLARI, aralik, maliyetGizle, sinirla, subeler } from './ortak';
import { camGruplari } from './stok-raporlari';
import { GRUP_ADLARI, RaporHatasi, type CalistirmaBaglami, type Filtre } from './tipler';

const router = Router();

function baglam(req: Request): CalistirmaBaglami {
  const role = (req.user?.role ?? Role.SALES_STAFF) as Role;
  return { userId: req.user?.userId ?? '', role, maliyetGorur: role === Role.ADMIN || role === Role.WAREHOUSE_MANAGER };
}

function filtreOku(govde: unknown): Filtre {
  const b = (govde ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined);
  const dizi = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 50) : undefined);
  const enAz = Number(b.enAz);
  return {
    bas: str(b.bas),
    bit: str(b.bit),
    subeIds: dizi(b.subeIds),
    lokasyonlar: dizi(b.lokasyonlar),
    kategori: str(b.kategori),
    marka: str(b.marka),
    ara: str(b.ara),
    personelId: str(b.personelId),
    musteriId: str(b.musteriId),
    odemeTipi: str(b.odemeTipi),
    durum: str(b.durum),
    camGrubu: str(b.camGrubu),
    enAz: Number.isFinite(enAz) && enAz > 0 ? enAz : undefined,
    gruplama: str(b.gruplama),
    karsilastir: b.karsilastir === true,
  };
}

async function calistir(req: Request) {
  const tanim = RAPOR_MAP.get(String(req.params.id));
  if (!tanim) throw new RaporHatasi('Rapor bulunamadı.');
  const f = filtreOku(req.body);
  for (const z of tanim.zorunlu ?? []) {
    const bos =
      (z === 'musteri' && !f.musteriId) ||
      (z === 'camGrubu' && !f.camGrubu) ||
      (z === 'personel' && !f.personelId) ||
      (z === 'lokasyon' && !(f.lokasyonlar ?? []).length) ||
      (z === 'ara' && !f.ara);
    const MESAJ: Partial<Record<string, string>> = {
      musteri: 'Önce müşteriyi seçin.',
      camGrubu: 'Önce cam grubunu seçin.',
      lokasyon: 'Önce lokasyon (mağaza) seçin.',
      ara: 'Arama kutusunu doldurun.',
    };
    if (bos) throw new RaporHatasi(MESAJ[z] ?? 'Eksik filtre.');
  }
  const ctx = baglam(req);
  const t0 = Date.now();
  let sonuc = await tanim.calistir(f, ctx);
  if (!ctx.maliyetGorur) sonuc = maliyetGizle(sonuc);
  console.log(`[hazir-raporlar] ${tanim.id} user=${ctx.userId} ${Date.now() - t0}ms satir=${sonuc.satirlar.length}`);
  return { tanim, f, sonuc };
}

function hata(res: Response, err: unknown) {
  if (err instanceof RaporHatasi) return res.status(400).json({ error: err.message });
  console.error('[hazir-raporlar] hata:', err);
  return res.status(500).json({ error: err instanceof Error ? err.message : 'Rapor hazırlanamadı.' });
}

router.get('/katalog', (_req, res) => {
  res.json({
    gruplar: GRUP_ADLARI,
    raporlar: RAPORLAR.map(({ calistir: _c, ...r }) => r),
  });
});

router.get('/secenekler', async (_req, res) => {
  try {
    const sb = await subeler();
    const personeller = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['SALES_STAFF', 'STORE_MANAGER', 'REGIONAL_MANAGER', 'WAREHOUSE_MANAGER', 'ADMIN'] } },
      select: { id: true, name: true, branch: { select: { code: true } } },
      orderBy: { name: 'asc' },
    });
    let camlar: string[] = [];
    try {
      camlar = await camGruplari();
    } catch (e) {
      console.warn('[hazir-raporlar] cam grupları okunamadı:', e instanceof Error ? e.message : e);
    }
    res.json({
      subeler: [...sb.entries()].map(([id, s]) => ({ id, kod: s.kod, ad: s.ad })).sort((a, b) => a.kod.localeCompare(b.kod, 'tr', { numeric: true })),
      lokasyonlar: Object.keys(STOK_LOKASYONLARI),
      personeller: personeller.map((p) => ({ id: p.id, ad: p.name, sube: p.branch?.code ?? '' })),
      odemeTipleri: Object.entries(ODEME_ADI)
        .filter(([k]) => k !== 'CIRO_DUZELTME')
        .map(([key, label]) => ({ key, label })),
      kategoriler: [
        { key: 'OPTIK_CERCEVE', label: 'Optik çerçeve' },
        { key: 'GUNES_GOZLUGU', label: 'Güneş gözlüğü' },
        { key: 'CAM', label: 'Cam' },
        { key: 'LENS', label: 'Lens' },
        { key: 'SOLUSYON', label: 'Solüsyon' },
        { key: 'AKSESUAR', label: 'Aksesuar' },
        { key: 'DIGER', label: 'Diğer' },
      ],
      camGruplari: camlar,
    });
  } catch (e) {
    hata(res, e);
  }
});

router.get('/musteri-ara', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ data: [] });
    const rakam = q.replace(/\D/g, '');
    const data = await prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          ...(rakam.length >= 4 ? [{ phone: { contains: rakam } }, { identityNo: { contains: rakam } }] : []),
        ],
      },
      select: { id: true, name: true, phone: true },
      take: 20,
      orderBy: { name: 'asc' },
    });
    return res.json({ data });
  } catch (e) {
    return hata(res, e);
  }
});

router.post('/:id/calistir', async (req, res) => {
  try {
    const { tanim, sonuc } = await calistir(req);
    res.json({ rapor: { id: tanim.id, ad: tanim.ad }, ...sinirla(sonuc) });
  } catch (e) {
    hata(res, e);
  }
});

router.post('/:id/excel', async (req, res) => {
  try {
    const { tanim, f, sonuc } = await calistir(req);
    const tarihli = tanim.filtreler.includes('tarih') && tanim.varsayilanTarih !== 'yok' ? aralik(f) : null;
    const alt = [
      tarihli ? `${tarihli.bas} – ${tarihli.bit}` : '',
      `Hazırlanma: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`,
    ]
      .filter(Boolean)
      .join(' · ');
    const buf = await excelUret(tanim.ad, alt, sonuc);
    const dosya = `${tanim.id}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${dosya}"`);
    res.send(buf);
  } catch (e) {
    hata(res, e);
  }
});

export default router;
