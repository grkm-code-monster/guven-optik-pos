import cron from 'node-cron';
import { partnerlereDurumBildir, partnerSiparisleriCek } from './eticaret-siparis.service';

let cronStarted = false;

/**
 * Her 2 dakikada bir: (1) partner'ın sipariş API'sinden yeni siparişleri çeker,
 * (2) durumu değişip partner'a henüz bildirilmemiş siparişleri partner'ın durum
 * güncelleme API'sine bildirir.
 */
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

    partnerlereDurumBildir()
      .then((sonuc) => {
        if (sonuc.bildirildi > 0) {
          console.log(`[EticaretSiparisCron] ${sonuc.bildirildi} sipariş durumu partner'a bildirildi.`);
        }
      })
      .catch((err) => {
        console.error('[EticaretSiparisCron] Durum bildirimi hatası:', err?.message ?? err);
      });
  });

  console.log('E-Ticaret sipariş çekme + durum bildirimi cron başlatıldı (her 2 dakikada bir)');
}
