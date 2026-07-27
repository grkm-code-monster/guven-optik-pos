/**
 * Gelen fatura çekme performans ölçümü (paralel detay çağrısı)
 */
import 'dotenv/config';
import { cekGelenFaturalar } from '../src/modules/efatura/gelen-fatura.service';

async function main() {
  const sirketId = process.argv[2] ?? 'ng';
  const gun = Number(process.argv[3] ?? 3);
  const baslangic = new Date(Date.now() - gun * 86400000).toISOString().slice(0, 10);
  const bitis = new Date().toISOString().slice(0, 10);

  console.log(`Şirket=${sirketId} aralık=${baslangic}..${bitis} onlyUnread=false`);
  const t0 = Date.now();
  const sonuc = await cekGelenFaturalar({
    sirketId,
    baslangic,
    bitis,
    onlyUnread: false,
    pageSize: 50,
    pageIndex: 0,
  });
  const wallMs = Date.now() - t0;
  console.log(JSON.stringify({ ...sonuc, wallMs }, null, 2));
  console.log(`Toplam süre: ${(wallMs / 1000).toFixed(1)} sn (iç sureMs=${sonuc.sureMs} ms)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
