import 'dotenv/config';
import { createApp } from './app';
import { startEfaturaCron } from './modules/efatura/efatura.cron';
import { startOzelSiparisCron } from './modules/ozel-siparis/ozel-siparis.cron';
import { startReportCron } from './modules/reports/report.cron';
import { startFiyatBildirimHatirlatmaCron } from './modules/admin/fiyat-bildirim-hatirlatma.cron';
import { startShiftAutoCloseCron } from './modules/shifts/shift-auto-close.cron';
import { startDovizKuruCron } from './modules/admin/doviz-kuru.cron';
import { startEticaretSiparisCron } from './modules/eticaret/eticaret-siparis.cron';

const port = Number(process.env.PORT) || 3000;
const app = createApp();

// ÖNEMLİ: Bu iki handler olmadan, bir route handler'ın try/catch bloğu
// dışında (ör. bir kütüphanenin iç event-emitter'ından, ya da bir .then()
// zincirinde yakalanmamış bir reject'ten) fırlayan HER hata, Node.js'in
// varsayılan davranışı gereği süreci SESSİZCE çökertiyordu — pm2 onu
// otomatik yeniden başlatıyordu ama hatanın ne olduğu hiçbir yere
// yazılmıyordu. Artık tam stack trace loglanıp öyle çıkılıyor (pm2 yine
// restart eder, davranış aynı — sadece artık teşhis edilebilir).
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error(
    '[FATAL] unhandledRejection:',
    reason instanceof Error ? reason.stack ?? reason.message : reason,
  );
  process.exit(1);
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

startEfaturaCron();
startOzelSiparisCron();
startReportCron();
startFiyatBildirimHatirlatmaCron();
startShiftAutoCloseCron();
startDovizKuruCron();
startEticaretSiparisCron();
