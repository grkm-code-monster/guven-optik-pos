import cron from 'node-cron';
import { partnerSiparisleriCek } from './eticaret-siparis.service';

let cronStarted = false;

/** Partner e-ticaret sitesinin sipariş API'sinden her 2 dakikada bir yeni siparişleri çeker. */
export function startEticaretSiparisCron(): void {
  if (cronStarted) return;
  cronStarted = true;

  cron.schedule('*/2 * * * *', () => {
    partnerSiparisleriCek()
      .then((sonuc) => {
        if (sonuc.yeni > 0) {
          console.log(`[EticaretSiparisCron] ${sonuc.yeni} yeni e-ticaret siparişi çekildi.`);
        }
        if (sonuc.hata) {
          console.error('[EticaretSiparisCron] Partner API hatası:', sonuc.hata);
        }
      })
      .catch((err) => {
        console.error('[EticaretSiparisCron] Hata:', err?.message ?? err);
      });
  });

  console.log('E-Ticaret sipariş çekme cron başlatıldı (her 2 dakikada bir)');
}
