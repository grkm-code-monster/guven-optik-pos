/**
 * Salt-okunur: "envanter-import-sablon GÜNEŞ 1.xlsx" dosyasindaki, hicbir
 * referans Excel'de barkodu bulunamayan 36 satir icin, CANLI Odoo'da
 * (product.product + nitelik degerleri: MODEL/RENK/ÖLÇÜ) ayni urunun daha
 * once girilip girilmedigini arar. Hicbir sey YAZMAZ, sadece ne bulundugunu
 * raporlar.
 *
 * AYRICA: bu markalarda (GÜNEŞ GÖZLÜĞÜ / çerçeve) kullanilan placeholder
 * barkod serisinin ("86800000000" + 2(+) haneli sira no — ör. 8680000000024)
 * su ana kadar en son hangi numaraya kadar geldigini bulur, boylece hic
 * bulunamayan satirlara bu serinin DEVAMINDAN numara onerilebilir.
 *
 * Kullanim:
 *   cd backend
 *   npm run gunes-canli-barkod-tamamla
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const GUNES_PLACEHOLDER_ONEKI = '86800000000';

type HedefSatir = { rownum: number; ad: string; model: string; renk: string; olcu: number };

const HEDEF_SATIRLAR: HedefSatir[] = [
  { rownum: 13, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1097PG', renk: 'C7', olcu: 53 },
  { rownum: 23, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: '10092PG', renk: 'C4', olcu: 52 },
  { rownum: 32, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG000021PG', renk: 'C2', olcu: 48 },
  { rownum: 39, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: '2227AG', renk: 'C3', olcu: 50 },
  { rownum: 42, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2225AG', renk: 'C4', olcu: 50 },
  { rownum: 65, ad: 'BENX GÜNEŞ GÖZLÜĞÜ', model: '8001BG', renk: 'C3', olcu: 58 },
  { rownum: 71, ad: 'DE VALAENTINI GÜNEŞ GÖZLÜĞÜ', model: 'VG1073DG', renk: 'C6', olcu: 49 },
  { rownum: 132, ad: 'HELENA RUBENSTEIN GÜNEŞ GÖZLÜĞÜ', model: 'HR2214HG', renk: 'C4', olcu: 49 },
  { rownum: 150, ad: 'MARCO SALVADORI GÜNEŞ GÖZLÜĞÜ', model: 'MS118MG', renk: 'C214', olcu: 55 },
  { rownum: 151, ad: 'MARCO SALVADORI GÜNEŞ GÖZLÜĞÜ', model: 'MS127MG', renk: 'C30', olcu: 52 },
  { rownum: 173, ad: 'MUSTANG GÜNEŞ GÖZLÜĞÜ', model: 'MU1749MG', renk: 'C3', olcu: 51 },
  { rownum: 178, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '86066OG', renk: 'C405P', olcu: 49 },
  { rownum: 191, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8951OG', renk: 'C102P', olcu: 52 },
  { rownum: 196, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '3850OG', renk: 'C101O', olcu: 56 },
  { rownum: 201, ad: 'OSSE GÜNEŞ GÖZLÜĞÜ', model: 'OS3256OG', renk: 'C3', olcu: 55 },
  { rownum: 221, ad: 'OSSE GÜNEŞ GÖZLÜĞÜ', model: 'OS3210OG', renk: 'C5', olcu: 54 },
  { rownum: 222, ad: 'OSSE GÜNEŞ GÖZLÜĞÜ', model: 'OS3109OG', renk: 'C5', olcu: 50 },
  { rownum: 240, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1880PG', renk: 'C1', olcu: 55 },
  { rownum: 241, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1810PG', renk: 'C1', olcu: 62 },
  { rownum: 243, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1810PG', renk: 'C2', olcu: 62 },
  { rownum: 255, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2250PG', renk: 'C1', olcu: 62 },
  { rownum: 256, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'AYD2030AG', renk: 'C4', olcu: 49 },
  { rownum: 257, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1810PG', renk: 'C2', olcu: 62 },
  { rownum: 259, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1810PG', renk: 'C1', olcu: 62 },
  { rownum: 260, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1810PG', renk: 'C1', olcu: 62 },
  { rownum: 264, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: '5004PG', renk: 'C2', olcu: 56 },
  { rownum: 265, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2623PG', renk: 'C1', olcu: 60 },
  { rownum: 302, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SS220SG', renk: 'C3', olcu: 49 },
  { rownum: 304, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SE343SG', renk: 'C4', olcu: 54 },
  { rownum: 305, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SS220SG', renk: 'C2', olcu: 49 },
  { rownum: 306, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SS320SG', renk: 'CRB01', olcu: 49 },
  { rownum: 309, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SE344SG', renk: 'C5', olcu: 55 },
  { rownum: 310, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SS220SG', renk: 'C290', olcu: 49 },
  { rownum: 334, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: 'MS169TG', renk: 'C233', olcu: 50 },
  { rownum: 336, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: '7052TG', renk: 'C8', olcu: 51 },
  { rownum: 338, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: 'VG1059TG', renk: 'C7', olcu: 53 },
];

function normTight(s: string | null | undefined): string {
  if (!s) return '';
  let t = s.trim().toUpperCase();
  const repl: Record<string, string> = { İ: 'I', Ü: 'U', Ö: 'O', Ş: 'S', Ç: 'C', Ğ: 'G' };
  for (const [k, v] of Object.entries(repl)) t = t.split(k).join(v);
  return t.replace(/[^A-Z0-9]/g, '');
}

function normRenk(s: string | null | undefined): string {
  const t = normTight(s);
  return t.replace(/\d+/g, (m) => String(Number(m)));
}

function modelCore(s: string | null | undefined): string {
  const t = normTight(s);
  const m = t.match(/^(.*\d)([A-Z]+)$/);
  return m ? m[1] : t;
}

function similarity(a: string, b: string): number {
  // basit Dice/ortak karakter benzerligi (SequenceMatcher yerine kaba bir yaklasim)
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let common = 0;
  for (const c of setA) if (setB.has(c)) common++;
  return (2 * common) / (a.length + b.length);
}

function gercekciBarkod(b: string | null | undefined): boolean {
  if (!b) return false;
  const s = String(b).trim();
  if (!/^\d+$/.test(s)) return false;
  if (s.length < 8) return false; // internal kisa referans numaralari (12686 gibi) degil
  if (s.startsWith(GUNES_PLACEHOLDER_ONEKI)) return false; // placeholder, gercek degil
  return true;
}

async function main() {
  const brands = Array.from(new Set(HEDEF_SATIRLAR.map((r) => r.ad)));
  console.log(`${HEDEF_SATIRLAR.length} satir, ${brands.length} marka icin canli Odoo aranacak...\n`);

  type Varyant = { id: number; barcode: string | false; model: string | null; renk: string | null; olcu: string | null };
  const varyantlarByBrand: Record<string, Varyant[]> = {};

  for (const brand of brands) {
    const variants = (await execute(
      'product.product', 'search_read',
      [[['product_tmpl_id.name', '=', brand]]],
      { fields: ['id', 'barcode', 'product_template_attribute_value_ids'], limit: 2000, context: { active_test: false } },
    )) as Array<{ id: number; barcode: string | false; product_template_attribute_value_ids: number[] }>;

    const allAttrIds = Array.from(new Set(variants.flatMap((v) => v.product_template_attribute_value_ids || [])));
    let attrMap: Record<number, { name: string; attrName: string }> = {};
    if (allAttrIds.length) {
      const attrs = (await execute(
        'product.template.attribute.value', 'read',
        [allAttrIds],
        { fields: ['id', 'name', 'attribute_id'], context: { active_test: false } },
      )) as Array<{ id: number; name: string; attribute_id: [number, string] }>;
      attrMap = Object.fromEntries(attrs.map((a) => [a.id, { name: a.name, attrName: a.attribute_id[1] }]));
    }

    const parsed: Varyant[] = variants.map((v) => {
      let model: string | null = null;
      let renk: string | null = null;
      let olcu: string | null = null;
      for (const id of v.product_template_attribute_value_ids || []) {
        const a = attrMap[id];
        if (!a) continue;
        if (a.attrName === 'MODEL') model = a.name;
        else if (a.attrName === 'RENK') renk = a.name;
        else if (a.attrName === 'ÖLÇÜ') olcu = a.name;
      }
      return { id: v.id, barcode: v.barcode, model, renk, olcu };
    });
    varyantlarByBrand[brand] = parsed;
    console.log(`  ${brand}: ${parsed.length} varyant cekildi`);
  }

  console.log('\n=== ESLESTIRME SONUCLARI ===\n');
  const bulunanlar: Array<{ rownum: number; barkod: string }> = [];
  const bulunamayanlar: HedefSatir[] = [];

  for (const hedef of HEDEF_SATIRLAR) {
    const cands = varyantlarByBrand[hedef.ad] || [];
    const tcore = modelCore(hedef.model);
    const tcoreDigits = tcore.replace(/\D/g, '');
    let best: Varyant | null = null;
    let bestScore = -1;
    let second: Varyant | null = null;
    let secondScore = -1;

    for (const c of cands) {
      const renkScore = c.renk ? similarity(normRenk(hedef.renk), normRenk(c.renk)) : 0;
      const exactRenk = c.renk && normRenk(hedef.renk) === normRenk(c.renk) ? 1 : 0;
      const modelScore = c.model ? similarity(normTight(hedef.model), normTight(c.model)) : 0;
      const refTight = c.model ? normTight(c.model) : '';
      const refDigits = refTight.replace(/\D/g, '');
      const coreHit = tcore && refTight.includes(tcore) ? 1 : 0;
      const digitHit = !coreHit && tcoreDigits.length >= 3 && refDigits.includes(tcoreDigits) ? 1 : 0;
      let widthScore = 0;
      if (c.olcu) {
        const cw = Number((c.olcu.match(/\d+/) || [])[0]);
        if (Number.isFinite(cw) && Number.isFinite(hedef.olcu)) {
          widthScore = Math.max(0, 1 - Math.abs(hedef.olcu - cw) / 10);
        }
      }
      const score = coreHit * 8 + digitHit * 6 + exactRenk * 5 + renkScore * 2 + modelScore * 1.5 + widthScore * 1;
      // Renk (renk kodu) TUTMUYORSA bu aday asla "best" olamaz — barkod
      // renge/SKU'ya ozeldir, model ayni olsa da farkli renkteki bir
      // urunun barkodunu kullanmak YANLIS kayit/mukerrer riski yaratir.
      if (!exactRenk) continue;
      if (score > bestScore) {
        second = best; secondScore = bestScore;
        best = c; bestScore = score;
      } else if (score > secondScore) {
        second = c; secondScore = score;
      }
    }

    const belirsiz = best && second && bestScore > 0 && (bestScore - secondScore) <= 0.75
      && String(best.barcode || '') !== String(second.barcode || '');

    if (best && bestScore >= 3 && !belirsiz && gercekciBarkod(best.barcode)) {
      console.log(`  satir${hedef.rownum} ${hedef.ad} ${hedef.model}/${hedef.renk}/${hedef.olcu} -> CANLI BULUNDU: barkod=${best.barcode} (ref model=${best.model} renk=${best.renk} olcu=${best.olcu}, skor=${bestScore.toFixed(2)})`);
      bulunanlar.push({ rownum: hedef.rownum, barkod: String(best.barcode) });
    } else {
      console.log(`  satir${hedef.rownum} ${hedef.ad} ${hedef.model}/${hedef.renk}/${hedef.olcu} -> BULUNAMADI${belirsiz ? ' (belirsiz)' : ''}${best ? ` (en yakin: ${best.model}/${best.renk}/${best.olcu} barkod=${best.barcode}, skor=${bestScore.toFixed(2)})` : ''}`);
      bulunamayanlar.push(hedef);
    }
  }

  console.log(`\nCANLI BULUNAN: ${bulunanlar.length} / ${HEDEF_SATIRLAR.length}`);
  console.log(`HALA BULUNAMAYAN: ${bulunamayanlar.length}`);

  // ---- Placeholder seri max tespiti ----
  // Gorkem'in hatirladigina gore seri 1200+'e kadar gitmis olabilir — daha
  // dar onek ("868") ile GENIS bir arama yaparak farkli uzunluk/sifirlama
  // varyasyonlarini da (0868..., 868XXXXXXXXXX gibi) yakalamaya calisiyoruz.
  const GENIS_ONEK = '868';
  const genisUrunler = (await execute(
    'product.product', 'search_read',
    [[['barcode', 'like', GENIS_ONEK]]],
    { fields: ['barcode'], limit: 20000, context: { active_test: false } },
  )) as Array<{ barcode: string | false }>;
  const genisLotlar = (await execute(
    'stock.lot', 'search_read',
    [[['ref', 'like', GENIS_ONEK]]],
    { fields: ['ref'], limit: 20000, context: { active_test: false } },
  )) as Array<{ ref: string | false }>;
  console.log(`\n(Genis tarama: "${GENIS_ONEK}" iceren ${genisUrunler.length} urun barkodu + ${genisLotlar.length} lot referansi bulundu)`);
  const benzersizBarkodlar = new Set<string>();
  for (const v of [...genisUrunler.map((p) => p.barcode), ...genisLotlar.map((l) => l.ref)]) {
    if (typeof v === 'string' && v.trim()) benzersizBarkodlar.add(v.trim());
  }
  // En uzun/en cok tekrar eden onek kaliplarini goster (ilk 8 karaktere gore grupla)
  const onekSayaclari: Record<string, number> = {};
  for (const b of benzersizBarkodlar) {
    const onek8 = b.slice(0, 8);
    onekSayaclari[onek8] = (onekSayaclari[onek8] || 0) + 1;
  }
  console.log('Benzersiz barkod/ref sayisi (868 iceren):', benzersizBarkodlar.size);
  console.log('Ilk-8-karakter onek dagilimi (en cok tekrar eden 15):');
  Object.entries(onekSayaclari).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`  "${k}..." -> ${v} kayit`));

  const [urunler, lotlar] = await Promise.all([
    execute(
      'product.product', 'search_read',
      [[['barcode', 'like', GUNES_PLACEHOLDER_ONEKI]]],
      { fields: ['barcode'], limit: 5000, context: { active_test: false } },
    ) as Promise<Array<{ barcode: string | false }>>,
    execute(
      'stock.lot', 'search_read',
      [[['ref', 'like', GUNES_PLACEHOLDER_ONEKI]]],
      { fields: ['ref'], limit: 5000, context: { active_test: false } },
    ) as Promise<Array<{ ref: string | false }>>,
  ]);
  // "DELETE_86800000000123" gibi arsivlenmis/silinmis kayitlar da onekin
  // SUBSTRING'i olarak eslesiyor (Odoo'nun 'like' operatoru substring arar)
  // ama startsWith() bunlari atlar. indexOf kullanarak onek NEREDE olursa
  // olsun (DELETE_ ile basliyorsa bile) sonrasindaki sira numarasini al —
  // boylece arsivlenmis eski numaralar da "kullanilmis" sayilir, cakisma
  // riskini sifira indirir.
  let maxSuffix = 0;
  let maxSuffixKaynak = '';
  for (const deger of [...urunler.map((p) => p.barcode), ...lotlar.map((l) => l.ref)]) {
    const bc = typeof deger === 'string' ? deger.trim() : '';
    const idx = bc.indexOf(GUNES_PLACEHOLDER_ONEKI);
    if (idx === -1) continue;
    const kalan = bc.slice(idx + GUNES_PLACEHOLDER_ONEKI.length);
    const m = kalan.match(/^(\d+)/);
    if (!m) continue;
    const suffix = Number(m[1]);
    if (Number.isFinite(suffix) && suffix > maxSuffix) {
      maxSuffix = suffix;
      maxSuffixKaynak = bc;
    }
  }
  console.log(`\nPLACEHOLDER SERI (${GUNES_PLACEHOLDER_ONEKI}XX, DELETE_ onekli arsivlenmisler dahil): su ana kadar en yuksek sira no = ${maxSuffix} (kaynak kayit: "${maxSuffixKaynak}", toplam ${urunler.length + lotlar.length} kayit tarandi)`);

  // Ayni hesaplamayi daha once cekilen GENIS ("868" iceren, DELETE_ dahil
  // hepsi) veri uzerinde de tekrarla — mutlak max icin capraz dogrulama.
  let genisMaxSuffix = 0;
  let genisMaxKaynak = '';
  for (const bc of benzersizBarkodlar) {
    const idx = bc.indexOf(GUNES_PLACEHOLDER_ONEKI);
    if (idx === -1) continue;
    const kalan = bc.slice(idx + GUNES_PLACEHOLDER_ONEKI.length);
    const m = kalan.match(/^(\d+)/);
    if (!m) continue;
    const suffix = Number(m[1]);
    if (Number.isFinite(suffix) && suffix > genisMaxSuffix) {
      genisMaxSuffix = suffix;
      genisMaxKaynak = bc;
    }
  }
  console.log(`CAPRAZ DOGRULAMA (genis "868" taramasindan): en yuksek sira no = ${genisMaxSuffix} (kaynak: "${genisMaxKaynak}")`);
  maxSuffix = Math.max(maxSuffix, genisMaxSuffix);
  console.log(`Sonraki onerilecek placeholder: ${GUNES_PLACEHOLDER_ONEKI}${String(maxSuffix + 1).padStart(2, '0')}`);

  console.log('\n=== HALA BULUNAMAYAN SATIRLARA ONERILECEK PLACEHOLDER BARKODLAR ===');
  let next = maxSuffix + 1;
  for (const h of bulunamayanlar) {
    const pb = `${GUNES_PLACEHOLDER_ONEKI}${String(next).padStart(2, '0')}`;
    console.log(`  satir${h.rownum} ${h.ad} ${h.model}/${h.renk}/${h.olcu} -> ${pb}`);
    next += 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
