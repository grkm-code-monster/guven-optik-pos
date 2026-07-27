import cron from 'node-cron';
import { Role } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { createBildirimler } from '../bildirim/bildirim.service';

const SABAH_SAATI = 9;
const OGLE_SAATI = 14;

type HatirlatmaDilimi = 'SABAH' | 'OGLE';

function dilimForHour(hour: number): HatirlatmaDilimi | null {
  if (hour === SABAH_SAATI) return 'SABAH';
  if (hour === OGLE_SAATI) return 'OGLE';
  return null;
}

function bugunBuDilimdeHatirlatildi(
  sonHatirlatma: Date | null | undefined,
  dilim: HatirlatmaDilimi,
  now: Date,
): boolean {
  if (!sonHatirlatma) return false;
  const sameDay =
    sonHatirlatma.getFullYear() === now.getFullYear() &&
    sonHatirlatma.getMonth() === now.getMonth() &&
    sonHatirlatma.getDate() === now.getDate();
  if (!sameDay) return false;
  const h = sonHatirlatma.getHours();
  if (dilim === 'SABAH') return h < 12;
  return h >= 12;
}

export async function processFiyatBildirimHatirlatma(now = new Date()): Promise<number> {
  const dilim = dilimForHour(now.getHours());
  if (!dilim) return 0;

  const bekleyenler = await prisma.fiyatDegisiklikBildirimi.findMany({
    where: { etiketBasildi: false },
  });

  const bySube = new Map<string, typeof bekleyenler>();
  for (const kayit of bekleyenler) {
    if (bugunBuDilimdeHatirlatildi(kayit.sonHatirlatmaTarihi, dilim, now)) continue;
    const list = bySube.get(kayit.subeKodu) ?? [];
    list.push(kayit);
    bySube.set(kayit.subeKodu, list);
  }

  let gonderilenSubeSayisi = 0;
  for (const [subeKodu, kayitlar] of bySube) {
    if (!kayitlar.length) continue;

    const branch = await prisma.branch.findUnique({
      where: { code: subeKodu },
      select: { id: true },
    });
    if (!branch) continue;

    const managers = await prisma.user.findMany({
      where: {
        branchId: branch.id,
        role: Role.STORE_MANAGER,
        isActive: true,
      },
      select: { id: true },
    });
    if (!managers.length) continue;

    await createBildirimler(
      managers.map((m) => m.id),
      {
        baslik: 'Etiket bekleyen fiyat değişiklikleri',
        mesaj: `${kayitlar.length} ürünün etiketi bekliyor (${subeKodu}).`,
        link: '/stok-sorgula',
        tip: 'FIYAT',
      },
    );

    await prisma.fiyatDegisiklikBildirimi.updateMany({
      where: { id: { in: kayitlar.map((k) => k.id) } },
      data: { sonHatirlatmaTarihi: now },
    });

    gonderilenSubeSayisi++;
  }

  return gonderilenSubeSayisi;
}

let cronStarted = false;

export function startFiyatBildirimHatirlatmaCron(): void {
  if (cronStarted) return;
  cronStarted = true;

  cron.schedule('0 * * * *', () => {
    const now = new Date();
    const hour = now.getHours();
    if (hour !== SABAH_SAATI && hour !== OGLE_SAATI) return;

    processFiyatBildirimHatirlatma(now)
      .then((count) => {
        if (count > 0) {
          console.log(`[FiyatBildirimHatirlatma] ${count} şubeye hatırlatma gönderildi`);
        }
      })
      .catch((err) => {
        console.error('[FiyatBildirimHatirlatma] Hata:', err);
      });
  });

  console.log('Fiyat bildirim hatırlatma cron başlatıldı (09:00 ve 14:00)');
}
