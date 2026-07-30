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
