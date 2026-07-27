import { Role } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { createBildirimler } from '../bildirim/bildirim.service';

async function notifyTransferRoles(baslik: string, mesaj: string, link = '/admin/stok-kontrol') {
  const alicilar = await prisma.user.findMany({
    where: { role: { in: [Role.ADMIN, Role.ACCOUNTANT] }, isActive: true },
    select: { id: true },
  });
  if (!alicilar.length) return;
  await createBildirimler(
    alicilar.map((u) => u.id),
    { baslik, mesaj, link, tip: 'TRANSFER' },
  );
}

export async function notifyTransferAksiyonFailure(
  transferRef: string,
  aksiyonLabel: string,
  mesaj: string,
) {
  try {
    await notifyTransferRoles(
      `Transfer #${transferRef} — ${aksiyonLabel} başarısız`,
      mesaj,
    );
  } catch (e) {
    console.warn('[transfer-bildirim] aksiyon bildirimi gönderilemedi:', e);
  }
}

export async function notifyEirsaliyeFailure(transferRef: string, mesaj: string) {
  try {
    await notifyTransferRoles(
      `Transfer #${transferRef} tamamlandı — e-İrsaliye gönderilemedi`,
      mesaj,
    );
  } catch (e) {
    console.warn('[transfer-bildirim] e-irsaliye bildirimi gönderilemedi:', e);
  }
}

export async function notifyManualIntervention(transferRef: string, mesaj: string) {
  try {
    await notifyTransferRoles(
      `Şirketler arası transfer yarım kaldı (#${transferRef})`,
      mesaj,
    );
  } catch (e) {
    console.warn('[transfer-bildirim] manuel müdahale bildirimi gönderilemedi:', e);
  }
}
