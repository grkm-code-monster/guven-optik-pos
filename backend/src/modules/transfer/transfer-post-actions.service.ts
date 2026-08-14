import {
  getSupplierInfo,
  tetikleTransferEFatura,
} from '../efatura/uyumsoft-efatura.service';
import {
  resolveTransferFaturaKalemler,
} from './transfer-maliyet.util';
import {
  type DespatchPartyInfo,
  getUserAliasses,
  isEDespatchUser,
  isEirsaliyeTransferEnabled,
  isOutboxDespatchError,
  parseDespatchReceiverAlias,
  resolveIrsaliyeNoForTransfer,
  saveIrsaliyeKayit,
  scheduleDespatchOutboxRecheck,
  sendDespatch,
} from '../efatura/uyumsoft-irsaliye.service';
import { transferUtsBildirimGonder } from '../uts/uts.service';
import { getUtsKurumNo } from '../uts/uts-kurum.service';
import { logTransferAksiyon, updateLatestTransferAksiyonLog } from './transfer-aksiyon-log.service';
import { notifyEirsaliyeFailure, notifyTransferAksiyonFailure } from './transfer-bildirim.util';

export type TransferPostActionEvent = 'BASLATILDI' | 'KABUL_EDILDI';

export type TransferPostActionSube = {
  subeKodu: string;
  sirketId: number;
  sirketKodu?: string;
};

export type TransferPostActionKalem = {
  productId: number;
  resolvedProductId?: number;
  urunAdi?: string;
  miktar?: number;
  maliyet?: number;
  lotId?: number;
  lotAdi?: string;
  utsKodu?: string;
  utsFirmaKodu?: string;
};

export type TransferPostActionsInput = {
  transferRef: string;
  event: TransferPostActionEvent;
  kaynak: TransferPostActionSube;
  hedef: TransferPostActionSube;
  kalemler: TransferPostActionKalem[];
  odooPickingId?: number;
  kaynakLokAdi?: string;
  hedefLokAdi?: string;
};

export type TransferSenaryo = 'SIRKET_DEGISIYOR' | 'FARKLI_LOKASYON' | 'AYNI_LOKASYON';

export type TransferAksiyonAdim = {
  adim: string;
  label: string;
  durum: 'basarili' | 'basarisiz' | 'atlandi';
  mesaj?: string;
  kayitId?: string;
};

export type TransferAksiyonSonuc = {
  senaryo: TransferSenaryo;
  adimlar: TransferAksiyonAdim[];
};

const ODOO_COMPANY_TO_SIRKET_AYAR: Record<number, string> = {
  2: 'ng',
  3: 'adese',
  4: 'potential',
};

export function detectTransferSenaryo(
  kaynak: TransferPostActionSube,
  hedef: TransferPostActionSube,
): TransferSenaryo {
  if (kaynak.sirketId !== hedef.sirketId) return 'SIRKET_DEGISIYOR';
  const kaynakKodu = kaynak.subeKodu.trim().toUpperCase();
  const hedefKodu = hedef.subeKodu.trim().toUpperCase();
  if (kaynakKodu !== hedefKodu) return 'FARKLI_LOKASYON';
  return 'AYNI_LOKASYON';
}

function supplierToDespatchParty(s: Awaited<ReturnType<typeof getSupplierInfo>>): DespatchPartyInfo {
  return {
    vkn: s.vkn,
    idScheme: s.idScheme,
    unvan: s.unvan,
    adres: s.adres,
    il: s.il,
    ilce: s.ilce,
    vergiDairesi: s.vergiDairesi,
    telefon: s.telefon,
    email: s.email,
  };
}

function pushAdim(adimlar: TransferAksiyonAdim[], adim: TransferAksiyonAdim) {
  adimlar.push(adim);
}

async function persistAdim(
  transferRef: string,
  adim: TransferAksiyonAdim,
  aksiyonTipi: 'EFATURA' | 'EIRSALIYE' | 'UTS_VERME' | 'UTS_ALMA',
) {
  const durumMap = {
    basarili: 'basarili',
    basarisiz: 'basarisiz',
    atlandi: 'atlandi',
  } as const;
  await logTransferAksiyon({
    transferRef,
    aksiyon: aksiyonTipi,
    durum: durumMap[adim.durum],
    mesaj: adim.mesaj,
    kayitId: adim.kayitId,
  });
}

export function filterUtsKalemler(
  kalemler: TransferPostActionKalem[],
  senaryo: TransferSenaryo,
  kaynakUtsKurumNo: string | null,
  hedefUtsKurumNo: string | null,
): TransferPostActionKalem[] {
  return kalemler.filter((k) => {
    if (!k.utsKodu?.trim()) return false;
    if (senaryo === 'SIRKET_DEGISIYOR') return true;
    if (senaryo === 'FARKLI_LOKASYON') {
      if (!kaynakUtsKurumNo || !hedefUtsKurumNo) return false;
      return kaynakUtsKurumNo !== hedefUtsKurumNo;
    }
    return false;
  });
}

async function runEFatura(
  input: TransferPostActionsInput,
  adimlar: TransferAksiyonAdim[],
) {
  const adim: TransferAksiyonAdim = {
    adim: 'e_fatura_gonder',
    label: 'e-Fatura gönderimi',
    durum: 'basarisiz',
  };

  if (!input.kalemler.length) {
    adim.durum = 'atlandi';
    adim.mesaj = 'Fatura kalemi yok';
    pushAdim(adimlar, adim);
    await persistAdim(input.transferRef, adim, 'EFATURA');
    return;
  }

  try {
    const hedefInfo = await getSupplierInfo(input.hedef.subeKodu);
    const faturaKalemler = await resolveTransferFaturaKalemler(
      input.kalemler,
      input.kaynak.sirketId,
      input.hedef.sirketId,
    );

    const sonuc = await tetikleTransferEFatura(
      input.transferRef,
      input.kaynak.subeKodu,
      {
        vkn: hedefInfo.vkn,
        unvan: hedefInfo.unvan,
        adres: hedefInfo.adres,
        il: hedefInfo.il,
        ilce: hedefInfo.ilce,
        vergiDairesi: hedefInfo.vergiDairesi,
        telefon: hedefInfo.telefon,
      },
      faturaKalemler,
    );

    if (sonuc.basarili) {
      adim.durum = 'basarili';
      adim.mesaj = sonuc.faturaNo ? `Resmi fatura: ${sonuc.faturaNo}` : 'Gönderildi';
      adim.kayitId = sonuc.faturaId;
    } else {
      adim.mesaj = sonuc.hata ?? 'e-Fatura gönderilemedi';
      if (sonuc.hata !== 'e-Fatura kuyrukta bekliyor') {
        await notifyTransferAksiyonFailure(input.transferRef, 'e-Fatura', adim.mesaj);
      }
    }
  } catch (err) {
    adim.mesaj = err instanceof Error ? err.message : String(err);
    await notifyTransferAksiyonFailure(input.transferRef, 'e-Fatura', adim.mesaj);
  }

  pushAdim(adimlar, adim);
  await persistAdim(input.transferRef, adim, 'EFATURA');
}

async function runEIrsaliye(
  input: TransferPostActionsInput,
  adimlar: TransferAksiyonAdim[],
) {
  const adim: TransferAksiyonAdim = {
    adim: 'e_irsaliye_gonder',
    label: 'e-İrsaliye gönderimi',
    durum: 'atlandi',
  };

  if (!isEirsaliyeTransferEnabled()) {
    adim.mesaj = 'E_IRSALIYE_TRANSFER_ENABLED=false';
    pushAdim(adimlar, adim);
    await persistAdim(input.transferRef, adim, 'EIRSALIYE');
    return;
  }

  adim.durum = 'basarisiz';
  const uyumsoftSirketId = ODOO_COMPANY_TO_SIRKET_AYAR[input.kaynak.sirketId] ?? 'ng';

  try {
    const gonderenInfo = supplierToDespatchParty(await getSupplierInfo(input.kaynak.subeKodu));
    const aliciInfo = supplierToDespatchParty(await getSupplierInfo(input.hedef.subeKodu));

    const aliciVkn = aliciInfo.vkn.replace(/\D/g, '');
    const eIrsaliyeMukellef = await isEDespatchUser(aliciVkn, undefined, uyumsoftSirketId);
    let aliciAlias: string | undefined;
    if (eIrsaliyeMukellef) {
      const aliasRaw = await getUserAliasses(aliciVkn, uyumsoftSirketId);
      aliciAlias = parseDespatchReceiverAlias(aliasRaw);
    }

    const now = new Date();
    const issueDate = now.toISOString().slice(0, 10);
    const issueTime = now.toTimeString().slice(0, 8);
    const irsaliyeNo = await resolveIrsaliyeNoForTransfer(
      input.transferRef,
      input.kaynak.subeKodu,
    );

    const kalemler = input.kalemler.map((k, idx) => ({
      sira: idx + 1,
      urunAdi: k.urunAdi || `Ürün ${k.productId}`,
      urunKodu: String(k.resolvedProductId ?? k.productId),
      miktar: k.miktar || 1,
      birim: 'C62',
    }));

    const result = await sendDespatch({
      irsaliyeNo,
      issueDate,
      issueTime,
      sevkTarihi: issueDate,
      gonderen: gonderenInfo,
      alici: aliciInfo,
      kalemler,
      transferRef: input.transferRef,
      aliciAlias,
      localDocumentId: input.transferRef,
      not: `Transfer ${input.kaynakLokAdi ?? input.kaynak.subeKodu} → ${input.hedefLokAdi ?? input.hedef.subeKodu}`,
    }, uyumsoftSirketId);

    const kayitId = result.irsaliyeId ?? result.ettn;

    if (result.basarili) {
      await saveIrsaliyeKayit({
        irsaliyeNo,
        sube: input.kaynak.subeKodu,
        transferRef: input.transferRef,
        ettn: result.ettn,
        durum: result.outboxOnaylandi ? 'ONAYLANDI' : 'GONDERILDI',
      });
    }

    if (result.basarili && result.outboxOnaylandi) {
      adim.durum = 'basarili';
      adim.mesaj = result.irsaliyeNo ?? result.mesaj;
      adim.kayitId = kayitId;
    } else if (result.basarili && !result.outboxOnaylandi) {
      adim.durum = 'basarili';
      adim.mesaj = `${result.irsaliyeNo ?? irsaliyeNo} (${result.outboxMesaj ?? 'Uyumsoft kuyruğunda'})`;
      adim.kayitId = kayitId;
      if (result.ettn) {
        scheduleDespatchOutboxRecheck(result.ettn, uyumsoftSirketId, async (status) => {
          if (!status.sorgulandi) return;
          if (isOutboxDespatchError(status.statusEnum)) {
            const hata = status.mesaj ?? `Uyumsoft zarf hatası (${status.statusEnum})`;
            await updateLatestTransferAksiyonLog({
              transferRef: input.transferRef,
              aksiyon: 'EIRSALIYE',
              durum: 'basarisiz',
              mesaj: hata,
              kayitId,
            });
            await notifyEirsaliyeFailure(
              input.transferRef,
              `Transfer #${input.transferRef} e-İrsaliye Uyumsoft'ta reddedildi. Hata: ${hata}`,
            );
          } else if (status.nihaiBasarili) {
            await updateLatestTransferAksiyonLog({
              transferRef: input.transferRef,
              aksiyon: 'EIRSALIYE',
              durum: 'basarili',
              mesaj: result.irsaliyeNo ?? irsaliyeNo,
              kayitId,
            });
          }
        });
      }
    } else {
      adim.mesaj = result.mesaj ?? 'e-İrsaliye gönderilemedi';
      adim.kayitId = kayitId;
      const bildirimMesaji =
        `Transfer #${input.transferRef} tamamlandı ancak e-İrsaliye gönderilemedi. Hata: ${adim.mesaj}`;
      await notifyEirsaliyeFailure(input.transferRef, bildirimMesaji);
    }
  } catch (err) {
    adim.mesaj = err instanceof Error ? err.message : String(err);
    const bildirimMesaji =
      `Transfer #${input.transferRef} tamamlandı ancak e-İrsaliye gönderilemedi. Hata: ${adim.mesaj}`;
    await notifyEirsaliyeFailure(input.transferRef, bildirimMesaji);
  }

  pushAdim(adimlar, adim);
  await persistAdim(input.transferRef, adim, 'EIRSALIYE');
}

async function runUtsBildirimi(
  input: TransferPostActionsInput,
  tip: 'VERME' | 'ALMA',
  utsKalemler: TransferPostActionKalem[],
  adimlar: TransferAksiyonAdim[],
) {
  const adimKey = tip === 'VERME' ? 'uts_verme' : 'uts_alma';
  const label = tip === 'VERME' ? 'UTS VERME bildirimi' : 'UTS ALMA bildirimi';
  const adim: TransferAksiyonAdim = { adim: adimKey, label, durum: 'basarisiz' };

  if (!utsKalemler.length) {
    adim.durum = 'atlandi';
    adim.mesaj = 'UTS kodu olan kalem yok veya kurum no koşulu sağlanmadı';
    pushAdim(adimlar, adim);
    await persistAdim(input.transferRef, adim, tip === 'VERME' ? 'UTS_VERME' : 'UTS_ALMA');
    return;
  }

  const subeKodu = tip === 'VERME' ? input.kaynak.subeKodu : input.hedef.subeKodu;
  const karsiSubeKodu = tip === 'VERME' ? input.hedef.subeKodu : input.kaynak.subeKodu;
  const odooCompanyId = tip === 'VERME' ? input.kaynak.sirketId : input.hedef.sirketId;

  try {
    const sonuc = await transferUtsBildirimGonder({
      tip,
      transferRef: input.transferRef,
      subeKodu,
      karsiSubeKodu,
      kalemler: utsKalemler,
      odooCompanyId,
    });

    if (sonuc.basarili) {
      adim.durum = 'basarili';
      adim.mesaj = sonuc.mesaj ?? `${utsKalemler.length} kalem`;
      adim.kayitId = sonuc.bildirimId;
    } else {
      adim.mesaj = sonuc.mesaj ?? 'UTS bildirimi gönderilemedi';
      await notifyTransferAksiyonFailure(input.transferRef, label, adim.mesaj);
    }
  } catch (err) {
    adim.mesaj = err instanceof Error ? err.message : String(err);
    await notifyTransferAksiyonFailure(input.transferRef, label, adim.mesaj);
  }

  pushAdim(adimlar, adim);
  await persistAdim(input.transferRef, adim, tip === 'VERME' ? 'UTS_VERME' : 'UTS_ALMA');
}

/** Merkezi transfer sonrası aksiyonlar */
export async function runTransferPostActions(
  input: TransferPostActionsInput,
): Promise<TransferAksiyonSonuc> {
  const adimlar: TransferAksiyonAdim[] = [];
  const senaryo = detectTransferSenaryo(input.kaynak, input.hedef);

  if (senaryo === 'AYNI_LOKASYON') {
    pushAdim(adimlar, {
      adim: 'senaryo_atlandi',
      label: 'Aynı lokasyon — post-aksiyon yok',
      durum: 'atlandi',
    });
    return { senaryo, adimlar };
  }

  const kaynakUtsKurumNo = await getUtsKurumNo(input.kaynak.subeKodu);
  const hedefUtsKurumNo = await getUtsKurumNo(input.hedef.subeKodu);
  const utsKalemler = filterUtsKalemler(
    input.kalemler,
    senaryo,
    kaynakUtsKurumNo,
    hedefUtsKurumNo,
  );

  if (input.event === 'BASLATILDI') {
    if (senaryo === 'SIRKET_DEGISIYOR') {
      await runEFatura(input, adimlar);
      await runUtsBildirimi(input, 'VERME', utsKalemler, adimlar);
    } else if (senaryo === 'FARKLI_LOKASYON') {
      await runEIrsaliye(input, adimlar);
      await runUtsBildirimi(input, 'VERME', utsKalemler, adimlar);
    }
  } else if (input.event === 'KABUL_EDILDI') {
    await runUtsBildirimi(input, 'ALMA', utsKalemler, adimlar);
  }

  return { senaryo, adimlar };
}
