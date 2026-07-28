import cron from 'node-cron';
import { autoCloseOpenShifts } from './shift.service';

let cronStarted = false;

/** Her gün 23:59'da hâlâ açık kalan vardiyaları otomatik kapatır (personel unutmuş olabilir). */
export function startShiftAutoCloseCron(): void {
  if (cronStarted) return;
  cronStarted = true;

  cron.schedule(
    '59 23 * * *',
    () => {
      const now = new Date();
      autoCloseOpenShifts(now)
        .then((count) => {
          if (count > 0) {
            console.log(`[ShiftAutoClose] ${count} açık vardiya otomatik kapatıldı`);
          }
        })
        .catch((err) => {
          console.error('[ShiftAutoClose] Hata:', err);
        });
    },
    { timezone: 'Europe/Istanbul' },
  );

  console.log('Vardiya otomatik kapatma cron başlatıldı (her gün 23:59)');
}
