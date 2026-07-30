import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';

export type DovizKuruSonuc = {
  tarih: string; // YYYY-MM-DD
  usd: number;
  eur: number;
  kaynak: string;
};

function bugunTarihIstanbul(): string {
  // Europe/Istanbul tarihini YYYY-MM-DD olarak döndürür (sunucu saat dilimi ne olursa olsun).
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

/** TCMB'den o günün kurunu canlı çeker (kaydetmez). Başarısız olursa hata fırlatır. */
async function tcmbKuruCanliCek(): Promise<{ usd: number; eur: number }> {
  const https = await import('https');
  const xml = await new Promise<string>((resolve, reject) => {
    https.get('https://www.tcmb.gov.tr/kurlar/today.xml', (r) => {
      let data = '';
      r.on('data', (chunk) => { data += chunk; });
      r.on('end', () => resolve(data));
      r.on('error', reject);
    }).on('error', reject);
  });

  const usdMatch = xml.match(/<Currency[^>]*CurrencyCode="USD"[^>]*>[\s\S]*?<ForexSelling>([\d.]+)<\/ForexSelling>/);
  const eurMatch = xml.match(/<Currency[^>]*CurrencyCode="EUR"[^>]*>[\s\S]*?<ForexSelling>([\d.]+)<\/ForexSelling>/);

  const usd = usdMatch ? parseFloat(usdMatch[1]) : null;
  const eur = eurMatch ? parseFloat(eurMatch[1]) : null;

  if (!usd || !eur) {
    throw new Error('TCMB XML ayrıştırılamadı (USD/EUR bulunamadı)');
  }

  return { usd, eur };
}

/**
 * Bugünün TCMB kurunu döndürür. Sırasıyla:
 *  1) Veritabanında bugüne ait kayıt varsa onu döner.
 *  2) Yoksa TCMB'den canlı çekip veritabanına kaydeder.
 *  3) TCMB çekilemezse (hafta sonu / resmi tatil / bağlantı sorunu) veritabanındaki
 *     EN SON kaydı (dünkü/bir önceki iş günü kuru) "yaklaşık" olarak döner — asla
 *     sabit/uydurma bir rakama düşmez.
 *  4) Veritabanında hiç kayıt yoksa hata fırlatır (ilk çalıştırmada TCMB'ye erişim şart).
 */
export async function getOrFetchTodayRate(): Promise<DovizKuruSonuc> {
  const bugun = bugunTarihIstanbul();

  const mevcut = await prisma.dovizKuru.findUnique({ where: { tarih: new Date(bugun) } });
  if (mevcut) {
    return { tarih: bugun, usd: mevcut.usd.toNumber(), eur: mevcut.eur.toNumber(), kaynak: mevcut.kaynak };
  }

  try {
    const { usd, eur } = await tcmbKuruCanliCek();
    const kayit = await prisma.dovizKuru.upsert({
      where: { tarih: new Date(bugun) },
      update: { usd: new Prisma.Decimal(usd), eur: new Prisma.Decimal(eur), kaynak: 'TCMB' },
      create: { tarih: new Date(bugun), usd: new Prisma.Decimal(usd), eur: new Prisma.Decimal(eur), kaynak: 'TCMB' },
    });
    return { tarih: bugun, usd: kayit.usd.toNumber(), eur: kayit.eur.toNumber(), kaynak: kayit.kaynak };
  } catch (err: any) {
    console.error('[doviz-kuru] TCMB canlı çekim hatası:', err?.message);
    const sonKayit = await prisma.dovizKuru.findFirst({ orderBy: { tarih: 'desc' } });
    if (sonKayit) {
      console.warn(`[doviz-kuru] TCMB'ye ulaşılamadı, en son bilinen kur kullanılıyor (${sonKayit.tarih.toISOString().slice(0, 10)})`);
      return {
        tarih: sonKayit.tarih.toISOString().slice(0, 10),
        usd: sonKayit.usd.toNumber(),
        eur: sonKayit.eur.toNumber(),
        kaynak: `${sonKayit.kaynak} (gecikmeli — bugün için güncel kur alınamadı)`,
      };
    }
    throw new Error('TCMB kuru alınamadı ve veritabanında hiç kayıtlı kur yok.');
  }
}

/** Belirli bir tarihe ait kur — kayıtlıysa onu, yoksa o tarihten önceki en yakın kaydı döner. */
export async function getRateForDate(tarih: Date): Promise<DovizKuruSonuc | null> {
  const gun = new Date(tarih);
  gun.setHours(0, 0, 0, 0);

  const tam = await prisma.dovizKuru.findUnique({ where: { tarih: gun } });
  if (tam) {
    return { tarih: gun.toISOString().slice(0, 10), usd: tam.usd.toNumber(), eur: tam.eur.toNumber(), kaynak: tam.kaynak };
  }

  const oncesi = await prisma.dovizKuru.findFirst({
    where: { tarih: { lte: gun } },
    orderBy: { tarih: 'desc' },
  });
  if (!oncesi) return null;
  return {
    tarih: oncesi.tarih.toISOString().slice(0, 10),
    usd: oncesi.usd.toNumber(),
    eur: oncesi.eur.toNumber(),
    kaynak: oncesi.kaynak,
  };
}
