import { processFaturaKuyruk } from './uyumsoft-efatura.service';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export function startEfaturaCron(): void {
  setInterval(() => {
    processFaturaKuyruk().catch((err) => {
      console.error('[e-Fatura kuyruk]', err);
    });
  }, FIFTEEN_MINUTES);

  console.log('e-Fatura kuyruk işleyici başlatıldı (15 dk)');
}
