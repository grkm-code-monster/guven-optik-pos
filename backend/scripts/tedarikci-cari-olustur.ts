/**
 * 13.11.2026 — Alış faturalarındaki TÜM firmaları Optik POS'ta (Odoo res.partner) tedarikçi cari olarak açar.
 * Kaynak: scripts/data/tedarikci-cariler.json (faturalardan çıkarılan 110 firma: VKN/TCKN, ad, şehir).
 *
 * Her firma için:
 *  1) VKN ile kayıt VARSA → yeni açılmaz; tedarikçi işareti (supplier_rank) yoksa eklenir.
 *  2) VKN ile yok ama AYNI ADLA kayıt varsa → yeni açılmaz; VKN boşsa yazılır, tedarikçi işareti eklenir.
 *  3) Hiç yoksa → yeni cari: ad, VKN, şehir, şirket/şahıs, tedarikçi.
 * Tekrar çalıştırmak güvenlidir (açılmış olanlar 1. maddeye düşer).
 *
 * Varsayılan KURU (hiçbir şey yazmaz). Uygulamak için: --confirm
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execute } from '../src/modules/odoo/odoo.service';

type Firma = { vkn: string; ad: string; sehir: string; tur: string };
type Partner = { id: number; name: string; vat: string | false; supplier_rank: number; active: boolean };
const CTX = { context: { active_test: false, allowed_company_ids: [1, 2, 3, 4] } };

async function main() {
  const confirm = process.argv.includes('--confirm');
  const firmalar = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'tedarikci-cariler.json'), 'utf8')) as Firma[];
  console.log(confirm ? '### UYGULAMA MODU' : '### KURU MOD (hiçbir şey yazılmaz)');
  let acilan = 0, guncellenen = 0, zaten = 0, hata = 0;
  for (const f of firmalar) {
    try {
      const vatlar = [f.vkn, `TR${f.vkn}`];
      let p = ((await execute('res.partner', 'search_read', [[['vat', 'in', vatlar]]], {
        fields: ['id', 'name', 'vat', 'supplier_rank', 'active'], limit: 5, ...CTX,
      })) as Partner[])[0];
      let yol = 'VKN';
      if (!p) {
        p = ((await execute('res.partner', 'search_read', [[['name', '=ilike', f.ad]]], {
          fields: ['id', 'name', 'vat', 'supplier_rank', 'active'], limit: 5, ...CTX,
        })) as Partner[])[0];
        yol = 'AD';
      }
      if (p) {
        const degis: Record<string, unknown> = {};
        if (!p.supplier_rank) degis.supplier_rank = 1;
        if (!p.vat) degis.vat = f.vkn;
        if (Object.keys(degis).length) {
          console.log(`GÜNCELLE  #${p.id} ${p.name} (${yol} ile bulundu) → ${Object.keys(degis).join(', ')}`);
          if (confirm) await execute('res.partner', 'write', [[p.id], degis]);
          guncellenen++;
        } else {
          console.log(`ZATEN VAR #${p.id} ${p.name}`);
          zaten++;
        }
        continue;
      }
      const vals: Record<string, unknown> = {
        name: f.ad,
        vat: f.vkn,
        is_company: f.vkn.length === 10,
        supplier_rank: 1,
      };
      if (f.sehir) vals.city = f.sehir;
      console.log(`AÇILACAK  ${f.vkn} ${f.ad} (${f.tur}${f.sehir ? ', ' + f.sehir : ''})`);
      if (confirm) {
        const id = await execute('res.partner', 'create', [vals]);
        console.log(`   → açıldı #${id}`);
      }
      acilan++;
    } catch (e) {
      console.log(`HATA ${f.vkn} ${f.ad}: ${e instanceof Error ? e.message : e}`);
      hata++;
    }
  }
  console.log(`ÖZET: ${confirm ? 'açıldı' : 'açılacak'}=${acilan} güncellenen=${guncellenen} zaten-var=${zaten} hata=${hata} (toplam ${firmalar.length})`);
}

main().catch((e) => {
  console.error('HATA', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
