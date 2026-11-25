/**
 * STOKLU ÜRÜN ARŞİV KORUMASI (25.11.2026)
 *
 * Olay: 25.11.2026 ~10:45'te GVN6'ya Excel envanter ile Polo Village girişi
 * yapıldı. Varyant import'u şablonun nitelik satırını ([[6,0,...]]) yeniden
 * yazınca Odoo `_create_variant_ids` → `_unlink_or_archive` çalıştı: STOKLU
 * varyantları ARŞİVE aldı, yerlerine aynı kombinasyonda STOKSUZ ikizler açtı,
 * şablonu (#11214) da arşive düşürdü. GVN2'de rafta duran Polo'lar POS'ta
 * bulunamaz hale geldi. 23.11'deki GVN1 geçiş importları OSSE, OTTO, OPTELLI,
 * STEPPER, SWING, SWING KIDS, TOM FORD'da aynısını yaptı.
 *
 * Eski koruma (pasifeDusenleriGeriAl) yalnız "önceden aktif" varyantları geri
 * açmayı deniyordu; aynı kombinasyonda yeni aktif ikiz açıldığı için Odoo
 * `product_product_combination_unique` hatası veriyor, hata sadece loga
 * yazılıp yutuluyordu. Şablonun arşive düşmesine hiç bakılmıyordu.
 *
 * Bu modül:
 *  1. Yazmadan ÖNCE fotoğraf çeker (şablon aktif mi, hangi varyantlar aktif,
 *     hangi varyantlar aktif).
 *  2. Yazdıktan SONRA karşılaştırır: arşive düşen şablonu geri açar, arşive
 *     düşen varyantı geri açar. Kombinasyon çakışmasında yeni açılan ikiz
 *     BOŞSA (quant/lot/hareket/POS satışı yok) ikizi arşive alır, eski
 *     (stoklu) varyantı açar.
 *  3. Geri alınamayan bir şey kalırsa StokluArsivKorumaHatasi fırlatır —
 *     çağıran o ürün için stok girişini YAPMAZ, kullanıcı mesajı görür.
 *  4. Her geri alma AuditLog'a yazılır (action: STOKLU_ARSIV_KORUMA).
 *  5. Gece taraması: stoklu olduğu halde arşivde duran ürünleri bulup
 *     yöneticilere bildirim atar (otomatik düzeltme YAPMAZ).
 */
import cron from 'node-cron';
import { Role } from '@prisma/client';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { prisma } from '../../database/prisma';
import { createBildirimler } from '../bildirim/bildirim.service';

function ctx(): Record<string, unknown> {
  return { active_test: false, allowed_company_ids: [...ODOO_ALL_COMPANY_IDS] };
}

function parcala<T>(arr: T[], n = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function hataMesaji(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}

export class StokluArsivKorumaHatasi extends Error {
  constructor(message: string, public readonly rapor: KorumaRaporu) {
    super(message);
    this.name = 'StokluArsivKorumaHatasi';
  }
}

type VaryantDurum = {
  id: number;
  active: boolean;
  tmplId: number;
  kombinasyon: string;
  ad: string;
};

export type KorumaFotografi = {
  kaynak: string;
  sablonAktif: Map<number, boolean>;
  varyantlar: Map<number, VaryantDurum>;
};

export type KorumaRaporu = {
  sablonGeriAcilan: number[];
  varyantGeriAcilan: number[];
  ikizDegisimi: { stokluId: number; ikizId: number }[];
  cozulemeyen: { id: number; tur: 'sablon' | 'varyant'; ad: string; sebep: string }[];
};

function bosRapor(): KorumaRaporu {
  return { sablonGeriAcilan: [], varyantGeriAcilan: [], ikizDegisimi: [], cozulemeyen: [] };
}

// ── Okuma yardımcıları ─────────────────────────────────────────────────────

/** Şablon başına iç lokasyon stok toplamı (şablon seçiminde kullanılır). */
export async function sablonStokVeDurum(
  tmplIdleri: number[],
): Promise<Map<number, { aktif: boolean; stok: number }>> {
  const out = new Map<number, { aktif: boolean; stok: number }>();
  if (!tmplIdleri.length) return out;
  const sablonlar = (await execute(
    'product.template', 'read', [tmplIdleri], { fields: ['id', 'active'], context: ctx() },
  )) as { id: number; active: boolean }[];
  for (const s of sablonlar) out.set(s.id, { aktif: !!s.active, stok: 0 });
  const quants = (await execute(
    'stock.quant', 'search_read',
    [[['product_id.product_tmpl_id', 'in', tmplIdleri], ['location_id.usage', '=', 'internal'], ['quantity', '>', 0]]],
    { fields: ['product_id', 'quantity'], context: ctx() },
  )) as { product_id: [number, string] | false; quantity: number }[];
  if (quants.length) {
    const pIds = [...new Set(quants.map((q) => (q.product_id ? q.product_id[0] : 0)).filter(Boolean))];
    const pTmpl = new Map<number, number>();
    for (const grup of parcala(pIds)) {
      const ps = (await execute(
        'product.product', 'read', [grup], { fields: ['id', 'product_tmpl_id'], context: ctx() },
      )) as { id: number; product_tmpl_id: [number, string] }[];
      for (const p of ps) pTmpl.set(p.id, p.product_tmpl_id[0]);
    }
    for (const q of quants) {
      const t = q.product_id ? pTmpl.get(q.product_id[0]) : undefined;
      const d = t != null ? out.get(t) : undefined;
      if (d) d.stok += Number(q.quantity) || 0;
    }
  }
  return out;
}

export async function sablonAktifMi(tmplId: number): Promise<boolean> {
  const r = (await execute(
    'product.template', 'read', [[tmplId]], { fields: ['active'], context: ctx() },
  )) as { active: boolean }[];
  return !!r[0]?.active;
}

/**
 * Varyant import'unun dokunabileceği şablonlar: ana şablon + (eski "split by
 * model" yolunda) "{Ana Ad} {MODEL}" alt şablonları.
 */
async function ilgiliSablonlar(tmplId: number): Promise<number[]> {
  const r = (await execute(
    'product.template', 'read', [[tmplId]], { fields: ['name'], context: ctx() },
  )) as { name: string }[];
  const ad = r[0]?.name?.trim();
  const ids = new Set<number>([tmplId]);
  if (ad) {
    const alt = (await execute(
      'product.template', 'search',
      [[['name', '=like', `${ad} %`]]],
      { context: ctx(), limit: 3000 },
    )) as number[];
    for (const id of alt) ids.add(id);
  }
  return [...ids];
}

/** İkiz varyant gerçekten boş mu? (quant, lot, iptal dışı hareket, POS satışı yok) */
async function varyantBosMu(id: number): Promise<boolean> {
  const quant = Number(await execute('stock.quant', 'search_count', [[['product_id', '=', id]]], { context: ctx() }));
  if (quant) return false;
  const lot = Number(await execute('stock.lot', 'search_count', [[['product_id', '=', id]]], { context: ctx() }));
  if (lot) return false;
  const hareket = Number(await execute(
    'stock.move', 'search_count', [[['product_id', '=', id], ['state', '!=', 'cancel']]], { context: ctx() },
  ));
  if (hareket) return false;
  const satis = await prisma.saleItem.count({ where: { odooProductId: String(id) } });
  return satis === 0;
}

// ── Fotoğraf / karşılaştırma ───────────────────────────────────────────────

export async function fotografCek(tmplIdleri: number[], kaynak: string): Promise<KorumaFotografi> {
  const sablonAktif = new Map<number, boolean>();
  const varyantlar = new Map<number, VaryantDurum>();
  for (const grup of parcala(tmplIdleri)) {
    const ss = (await execute(
      'product.template', 'read', [grup], { fields: ['id', 'active'], context: ctx() },
    )) as { id: number; active: boolean }[];
    for (const s of ss) sablonAktif.set(s.id, !!s.active);
    const vs = (await execute(
      'product.product', 'search_read',
      [[['product_tmpl_id', 'in', grup]]],
      { fields: ['id', 'active', 'product_tmpl_id', 'combination_indices', 'display_name'], context: ctx() },
    )) as { id: number; active: boolean; product_tmpl_id: [number, string]; combination_indices: string | false; display_name: string }[];
    for (const v of vs) {
      varyantlar.set(v.id, {
        id: v.id,
        active: !!v.active,
        tmplId: v.product_tmpl_id[0],
        kombinasyon: v.combination_indices || '',
        ad: v.display_name,
      });
    }
  }
  return { kaynak, sablonAktif, varyantlar };
}

async function sablonuAc(tmplId: number, ad: string, rapor: KorumaRaporu): Promise<void> {
  try {
    await execute('product.template', 'write', [[tmplId], { active: true }], { context: ctx() });
    rapor.sablonGeriAcilan.push(tmplId);
  } catch (e) {
    rapor.cozulemeyen.push({ id: tmplId, tur: 'sablon', ad, sebep: hataMesaji(e) });
  }
}

/**
 * Arşivdeki bir varyantı geri açar. Odoo aynı kombinasyonda aktif bir ikiz
 * olduğu için reddederse ve o ikiz BOŞSA: ikiz arşive, bu varyant aktife.
 */
async function varyantiAc(id: number, ad: string, rapor: KorumaRaporu): Promise<void> {
  try {
    await execute('product.product', 'write', [[id], { active: true }], { context: ctx() });
    rapor.varyantGeriAcilan.push(id);
    return;
  } catch (ilkHata) {
    const v = (await execute(
      'product.product', 'read', [[id]],
      { fields: ['product_tmpl_id', 'combination_indices'], context: ctx() },
    )) as { product_tmpl_id: [number, string]; combination_indices: string | false }[];
    const tmplId = v[0]?.product_tmpl_id?.[0];
    const komb = v[0]?.combination_indices || '';
    const ikizler = tmplId
      ? ((await execute(
          'product.product', 'search',
          [[['product_tmpl_id', '=', tmplId], ['combination_indices', '=', komb], ['active', '=', true], ['id', '!=', id]]],
          { context: { allowed_company_ids: [...ODOO_ALL_COMPANY_IDS] } },
        )) as number[])
      : [];
    if (ikizler.length !== 1) {
      rapor.cozulemeyen.push({ id, tur: 'varyant', ad, sebep: `Geri açılamadı: ${hataMesaji(ilkHata)}` });
      return;
    }
    const ikizId = ikizler[0];
    if (!(await varyantBosMu(ikizId))) {
      rapor.cozulemeyen.push({
        id, tur: 'varyant', ad,
        sebep: `Aynı model/renk/ölçüde stoklu ya da hareketli başka aktif kayıt var (#${ikizId}) — elle birleştirilmeli`,
      });
      return;
    }
    try {
      await execute('product.product', 'write', [[ikizId], { active: false }], { context: ctx() });
    } catch (e) {
      rapor.cozulemeyen.push({ id, tur: 'varyant', ad, sebep: `Boş ikiz #${ikizId} arşive alınamadı: ${hataMesaji(e)}` });
      return;
    }
    try {
      await execute('product.product', 'write', [[id], { active: true }], { context: ctx() });
      rapor.ikizDegisimi.push({ stokluId: id, ikizId });
      rapor.varyantGeriAcilan.push(id);
    } catch (e) {
      // İkizi geri aç — hiçbir şeyi yarım bırakma.
      try { await execute('product.product', 'write', [[ikizId], { active: true }], { context: ctx() }); } catch { /* aşağıda raporlanıyor */ }
      rapor.cozulemeyen.push({ id, tur: 'varyant', ad, sebep: `İkiz değişimi başarısız: ${hataMesaji(e)}` });
    }
  }
}

/** Fotoğraftan bu yana arşive düşen şablon/varyantları geri açar. */
export async function fotografaGoreOnar(foto: KorumaFotografi): Promise<KorumaRaporu> {
  const rapor = bosRapor();
  const sablonIdleri = [...foto.sablonAktif.keys()];
  const varyantIdleri = [...foto.varyantlar.keys()];

  const simdiSablon = new Map<number, { active: boolean; name: string }>();
  for (const grup of parcala(sablonIdleri)) {
    // search_read: işlem sırasında silinmiş (unlink) kayıt varsa hata vermez, sadece gelmez.
    const ss = (await execute(
      'product.template', 'search_read', [[['id', 'in', grup]]], { fields: ['id', 'active', 'name'], context: ctx() },
    )) as { id: number; active: boolean; name: string }[];
    for (const s of ss) simdiSablon.set(s.id, { active: !!s.active, name: s.name });
  }
  const simdiVaryant = new Map<number, boolean>();
  for (const grup of parcala(varyantIdleri)) {
    const vs = (await execute(
      'product.product', 'search_read', [[['id', 'in', grup]]], { fields: ['id', 'active'], context: ctx() },
    )) as { id: number; active: boolean }[];
    for (const v of vs) simdiVaryant.set(v.id, !!v.active);
  }

  // 1) Önce şablonlar (arşivli şablondaki varyant satışta görünmez).
  for (const [id, onceAktif] of foto.sablonAktif) {
    const simdi = simdiSablon.get(id);
    if (onceAktif && simdi && !simdi.active) await sablonuAc(id, simdi.name, rapor);
  }
  // NOT: İşlemden ÖNCE zaten arşivde olan şablon/varyantlara DOKUNULMAZ
  // (eski arşivler — GYESSE, OTTO 222OO vb. — ayrı kararla ele alınır).

  // 2) Önceden aktif olup şimdi arşive düşen varyantlar.
  for (const [id, once] of foto.varyantlar) {
    if (!once.active) continue;
    const simdiAktif = simdiVaryant.get(id);
    if (simdiAktif === false) await varyantiAc(id, once.ad, rapor);
  }

  await raporuKaydet(foto.kaynak, rapor);
  return rapor;
}

/**
 * Stok girilen varyantlar: arşivdeyse aç (gerekirse boş ikizle yer değiştir),
 * şablonu arşivdeyse şablonu da aç. Stoklu ürün satış ekranında bulunmalı.
 */
export async function stokGirilenleriAcikTut(varyantIdleri: number[], kaynak: string): Promise<KorumaRaporu> {
  const rapor = bosRapor();
  if (!varyantIdleri.length) return rapor;
  const vs = (await execute(
    'product.product', 'read', [varyantIdleri],
    { fields: ['id', 'active', 'product_tmpl_id', 'display_name'], context: ctx() },
  )) as { id: number; active: boolean; product_tmpl_id: [number, string]; display_name: string }[];
  const tmplIdleri = [...new Set(vs.map((v) => v.product_tmpl_id[0]))];
  const ss = (await execute(
    'product.template', 'read', [tmplIdleri], { fields: ['id', 'active', 'name'], context: ctx() },
  )) as { id: number; active: boolean; name: string }[];
  for (const s of ss) if (!s.active) await sablonuAc(s.id, s.name, rapor);
  for (const v of vs) if (!v.active) await varyantiAc(v.id, v.display_name, rapor);
  await raporuKaydet(kaynak, rapor);
  return rapor;
}

async function raporuKaydet(kaynak: string, rapor: KorumaRaporu): Promise<void> {
  const bir = rapor.sablonGeriAcilan.length + rapor.varyantGeriAcilan.length + rapor.cozulemeyen.length;
  if (!bir) return;
  console.warn(
    `[stoklu-arsiv-koruma] ${kaynak}: şablon geri açılan=${rapor.sablonGeriAcilan.length}, ` +
    `varyant geri açılan=${rapor.varyantGeriAcilan.length}, ikiz değişimi=${rapor.ikizDegisimi.length}, ` +
    `ÇÖZÜLEMEYEN=${rapor.cozulemeyen.length}`,
    rapor.cozulemeyen.length ? JSON.stringify(rapor.cozulemeyen.slice(0, 20)) : '',
  );
  try {
    await prisma.auditLog.create({
      data: {
        userId: 'SISTEM',
        action: 'STOKLU_ARSIV_KORUMA',
        entity: 'product.product',
        entityId: kaynak.slice(0, 190),
        payload: rapor as unknown as object,
      },
    });
  } catch (e) {
    console.error('[stoklu-arsiv-koruma] AuditLog yazılamadı:', hataMesaji(e));
  }
}

export function korumaHataMesaji(rapor: KorumaRaporu): string {
  const liste = rapor.cozulemeyen
    .slice(0, 8)
    .map((c) => `${c.tur === 'sablon' ? 'Şablon' : 'Ürün'} #${c.id} ${c.ad}: ${c.sebep}`)
    .join(' | ');
  const fazla = rapor.cozulemeyen.length > 8 ? ` (+${rapor.cozulemeyen.length - 8} daha)` : '';
  return `İŞLEM DURDURULDU — stoklu ürünler arşive düştü ve otomatik geri alınamadı: ${liste}${fazla}. ` +
    'Bu ürün için stok girişi YAPILMADI. Lütfen yöneticiye bildirin.';
}

/**
 * Bir varyant yazma işlemini korumaya alır: önce fotoğraf, sonra işlem, sonra
 * (işlem hata verse bile) onarım. Onarılamayan bir şey kalırsa
 * StokluArsivKorumaHatasi fırlatılır.
 */
export async function stokluArsivKorumasiIle<T>(
  tmplId: number,
  kaynak: string,
  islem: () => Promise<T>,
): Promise<{ sonuc: T; rapor: KorumaRaporu }> {
  const foto = await fotografCek(await ilgiliSablonlar(tmplId), kaynak);
  let sonuc: T | undefined;
  let islemHatasi: unknown = null;
  try {
    sonuc = await islem();
  } catch (e) {
    islemHatasi = e;
  }
  const rapor = await fotografaGoreOnar(foto);
  if (rapor.cozulemeyen.length) {
    throw new StokluArsivKorumaHatasi(korumaHataMesaji(rapor), rapor);
  }
  if (islemHatasi) throw islemHatasi;
  return { sonuc: sonuc as T, rapor };
}

// ── Gece taraması ──────────────────────────────────────────────────────────

export type StokluArsivTaramaSonuc = {
  arsivliStokluVaryant: { id: number; ad: string; adet: number }[];
  arsivliStokluSablon: { id: number; ad: string; adet: number }[];
};

export async function stokluArsivTaramasi(): Promise<StokluArsivTaramaSonuc> {
  const quants = (await execute(
    'stock.quant', 'search_read',
    [[['location_id.usage', '=', 'internal'], ['quantity', '>', 0], '|',
      ['product_id.active', '=', false], ['product_id.product_tmpl_id.active', '=', false]]],
    { fields: ['product_id', 'quantity'], context: ctx() },
  )) as { product_id: [number, string] | false; quantity: number }[];

  const adetByVaryant = new Map<number, number>();
  for (const q of quants) {
    if (!q.product_id) continue;
    adetByVaryant.set(q.product_id[0], (adetByVaryant.get(q.product_id[0]) ?? 0) + (Number(q.quantity) || 0));
  }
  const ids = [...adetByVaryant.keys()];
  const varyantlar: { id: number; active: boolean; barcode: string | false; display_name: string; product_tmpl_id: [number, string] }[] = [];
  for (const grup of parcala(ids)) {
    varyantlar.push(...((await execute(
      'product.product', 'read', [grup],
      { fields: ['id', 'active', 'barcode', 'display_name', 'product_tmpl_id'], context: ctx() },
    )) as typeof varyantlar));
  }
  // Bilerek silinmiş (DELETE_ önekli) kayıtlar hariç.
  const gercek = varyantlar.filter((v) => !String(v.barcode || '').startsWith('DELETE_'));
  const tmplIdleri = [...new Set(gercek.map((v) => v.product_tmpl_id[0]))];
  const tmplAktif = new Map<number, boolean>();
  for (const grup of parcala(tmplIdleri)) {
    const ss = (await execute(
      'product.template', 'read', [grup], { fields: ['id', 'active'], context: ctx() },
    )) as { id: number; active: boolean }[];
    for (const s of ss) tmplAktif.set(s.id, !!s.active);
  }

  const arsivliStokluVaryant = gercek
    .filter((v) => !v.active)
    .map((v) => ({ id: v.id, ad: v.display_name, adet: adetByVaryant.get(v.id) ?? 0 }));
  const sablonAdet = new Map<number, { ad: string; adet: number }>();
  for (const v of gercek) {
    const t = v.product_tmpl_id[0];
    if (tmplAktif.get(t) !== false) continue;
    const d = sablonAdet.get(t) ?? { ad: v.product_tmpl_id[1], adet: 0 };
    d.adet += adetByVaryant.get(v.id) ?? 0;
    sablonAdet.set(t, d);
  }
  const arsivliStokluSablon = [...sablonAdet.entries()].map(([id, d]) => ({ id, ...d }));
  return { arsivliStokluVaryant, arsivliStokluSablon };
}

export async function stokluArsivGeceKontrolu(): Promise<StokluArsivTaramaSonuc> {
  const sonuc = await stokluArsivTaramasi();
  const v = sonuc.arsivliStokluVaryant.length;
  const s = sonuc.arsivliStokluSablon.length;
  console.log(`[stoklu-arsiv-gece] arşivde stoklu varyant=${v}, arşivde stoklu şablon=${s}`);
  try {
    await prisma.auditLog.create({
      data: {
        userId: 'SISTEM',
        action: 'STOKLU_ARSIV_GECE_TARAMA',
        entity: 'product.product',
        entityId: new Date().toISOString().slice(0, 10),
        payload: sonuc as unknown as object,
      },
    });
  } catch (e) {
    console.error('[stoklu-arsiv-gece] AuditLog yazılamadı:', hataMesaji(e));
  }
  if (!v && !s) return sonuc;

  const ornek = [...sonuc.arsivliStokluSablon]
    .sort((a, b) => b.adet - a.adet)
    .slice(0, 5)
    .map((x) => `${x.ad} (${x.adet})`)
    .join(', ');
  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN, isActive: true },
    select: { id: true },
  });
  if (admins.length) {
    await createBildirimler(admins.map((a) => a.id), {
      baslik: 'Arşivde stoklu ürün var',
      mesaj: `Gece kontrolü: ${v} ürün (varyant) ve ${s} ürün kartı ARŞİVDE ama stokta duruyor — satış ekranında bulunamaz.` +
        (ornek ? ` En çok: ${ornek}.` : '') + ' Liste: AuditLog STOKLU_ARSIV_GECE_TARAMA.',
      tip: 'GENEL',
    });
  }
  return sonuc;
}

let geceCronBasladi = false;

export function startStokluArsivGeceCron(): void {
  if (geceCronBasladi) return;
  geceCronBasladi = true;
  cron.schedule('30 3 * * *', () => {
    stokluArsivGeceKontrolu().catch((err) => console.error('[stoklu-arsiv-gece] Hata:', err));
  }, { timezone: 'Europe/Istanbul' });
  console.log('Stoklu-arşiv gece kontrolü cron başlatıldı (03:30)');
}
