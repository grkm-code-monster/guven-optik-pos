import cron from 'node-cron';
import { getOrFetchTodayRate } from './doviz-kuru.service';

let cronStarted = false;

/**
 * Her gün 16:00'da (TCMB günlük kuru genelde 15:30 civarı yayınlanır) o günün USD/EUR
 * kurunu çekip DovizKuru tablosuna kalıcı olarak yazar. SSKF Raporu ve ürün girişi
 * ekranı artık her seferinde TCMB'ye gitmek yerine bu kayıtlı kuru kullanabilir.
 */
export function startDovizKuruCron(): void {
  if (cronStarted) return;
  cronStarted = true;

  cron.schedule(
    '0 16 * * *',
    () => {
      getOrFetchTodayRate()
        .then((sonuc) => {
          console.log(`[DovizKuruCron] Kur güncellendi: USD ${sonuc.usd} / EUR ${sonuc.eur} (${sonuc.kaynak})`);
        })
        .catch((err) => {
          console.error('[DovizKuruCron] Hata:', err?.message);
        });
    },
    { timezone: 'Europe/Istanbul' },
  );

  console.log('Döviz kuru cron başlatıldı (her gün 16:00, TCMB)');
}
