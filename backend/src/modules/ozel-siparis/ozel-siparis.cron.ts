import { FIVE_MINUTES } from './ozel-siparis.cron.constants'
import { processLaboratuvarCron } from './ozel-siparis.service'

export function startOzelSiparisCron(): void {
  setInterval(() => {
    processLaboratuvarCron()
      .then((count) => {
        if (count > 0) console.log(`[ozel-siparis cron] ${count} sipariş LABORATUVARDA'ya alındı`)
      })
      .catch((err) => console.error('[ozel-siparis cron]', err))
  }, FIVE_MINUTES)

  console.log('Özel sipariş cron başlatıldı (5 dk)')
}
