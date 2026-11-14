import cron from 'node-cron';
import { utsBekleyenleriKontrolEt } from './uts-giris.service';

let basladi = false;

/** 14.11.2026 — UTS kaydı bekleyen ürün girişleri: 08:00–21:00 arası her 30 dakikada bir UTS'ye tekrar bakılır. */
export function startUtsBekleyenGirisCron(): void {
  if (basladi) return;
  basladi = true;
  cron.schedule('*/30 8-21 * * *', () => {
    utsBekleyenleriKontrolEt()
      .then((r) => {
        if (r.tamamlanan || r.zamanAsimi) console.log(`[UtsBekleyenGiris] bakılan ${r.bakilan}, tamamlanan ${r.tamamlanan}, zaman aşımı ${r.zamanAsimi}`);
      })
      .catch((e) => console.error('[UtsBekleyenGiris] hata:', e?.message ?? e));
  }, { timezone: 'Europe/Istanbul' });
}
