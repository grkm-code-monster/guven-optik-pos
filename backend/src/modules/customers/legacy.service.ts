import { prisma } from '../../database/prisma';
import { syncCustomerToOdoo } from '../odoo/odoo.service';

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

function legacyDisplayName(ad: string | null | undefined, soyad: string | null | undefined) {
  return [ad, soyad].filter(Boolean).join(' ').trim() || 'İsimsiz Müşteri';
}

function legacyPrimaryPhone(legacy: { cepTelefon?: string | null; telefon1?: string | null }) {
  return (legacy.cepTelefon?.trim() || legacy.telefon1?.trim() || '').trim();
}

function normalizePhoneDigits(phone: string) {
  return phone.replace(/\D/g, '');
}

export async function searchLegacyCustomers(q: string) {
  const rows = await prisma.legacyCustomer.findMany({
    where: {
      OR: [
        { ad: { contains: q, mode: 'insensitive' } },
        { soyad: { contains: q, mode: 'insensitive' } },
        { telefon1: { contains: q, mode: 'insensitive' } },
        { cepTelefon: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 20,
    orderBy: [{ ad: 'asc' }, { soyad: 'asc' }],
    include: {
      _count: { select: { sales: true, prescriptions: true } },
    },
  });

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [saleStats, rxStats] = await Promise.all([
    prisma.legacySale.groupBy({
      by: ['legacyCustomerId'],
      where: { legacyCustomerId: { in: ids } },
      _max: { tarih: true },
    }),
    prisma.legacyPrescription.groupBy({
      by: ['legacyCustomerId'],
      where: { legacyCustomerId: { in: ids } },
      _max: { tarih: true },
    }),
  ]);

  const lastSaleByCustomer = new Map(saleStats.map((s) => [s.legacyCustomerId, s._max.tarih]));
  const lastRxByCustomer = new Map(rxStats.map((s) => [s.legacyCustomerId, s._max.tarih]));

  return rows.map((row) => ({
    id: row.id,
    ad: row.ad,
    soyad: row.soyad,
    name: legacyDisplayName(row.ad, row.soyad),
    telefon: legacyPrimaryPhone(row) || null,
    kaynakSube: row.kaynakSube,
    siberCariHesapId: row.siberCariHesapId,
    saleCount: row._count.sales,
    lastSaleAt: lastSaleByCustomer.get(row.id) ?? null,
    prescriptionCount: row._count.prescriptions,
    lastPrescriptionAt: lastRxByCustomer.get(row.id) ?? null,
    _kaynak: 'legacy' as const,
  }));
}

export async function getLegacyCustomerDetail(id: string) {
  const legacy = await prisma.legacyCustomer.findUnique({
    where: { id },
    include: {
      sales: {
        include: { items: true },
        orderBy: [{ tarih: 'desc' }, { importedAt: 'desc' }],
      },
      prescriptions: {
        orderBy: [{ tarih: 'desc' }, { importedAt: 'desc' }],
      },
    },
  });

  if (!legacy) {
    throw codeError('LEGACY_CUSTOMER_NOT_FOUND', 'Arşiv müşterisi bulunamadı.');
  }

  return {
    ...legacy,
    name: legacyDisplayName(legacy.ad, legacy.soyad),
    telefon: legacyPrimaryPhone(legacy) || null,
  };
}

async function findPossibleDuplicate(legacy: {
  tcKimlikNo?: string | null;
  telefon1?: string | null;
  cepTelefon?: string | null;
}) {
  const tc = legacy.tcKimlikNo?.trim();
  if (tc) {
    const byTc = await prisma.customer.findFirst({ where: { identityNo: tc } });
    if (byTc) return byTc;
  }

  const phones = [legacy.cepTelefon, legacy.telefon1]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];

  for (const phone of phones) {
    const exact = await prisma.customer.findUnique({ where: { phone } });
    if (exact) return exact;

    const digits = normalizePhoneDigits(phone);
    if (digits.length >= 7) {
      const candidates = await prisma.customer.findMany({
        where: {
          OR: [
            { phone: { contains: digits.slice(-10), mode: 'insensitive' } },
            { phone: { contains: digits, mode: 'insensitive' } },
          ],
        },
        take: 5,
      });
      const matched = candidates.find((c) => normalizePhoneDigits(c.phone) === digits);
      if (matched) return matched;
    }
  }

  return null;
}

async function linkLegacyToCustomer(customerId: string, legacyCustomerId: string) {
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: { legacyCustomerId },
  });
  return updated;
}

async function createCustomerFromLegacy(legacy: Awaited<ReturnType<typeof getLegacyCustomerDetail>>) {
  const phone = legacyPrimaryPhone(legacy);
  if (!phone) {
    throw codeError('LEGACY_PHONE_MISSING', 'Arşiv kaydında telefon bilgisi yok, güncel kayıt oluşturulamaz.');
  }

  const existingPhone = await prisma.customer.findUnique({ where: { phone } });
  if (existingPhone) {
    throw codeError('CUSTOMER_PHONE_EXISTS', 'Bu telefon numarası zaten kayıtlı.');
  }

  if (legacy.tcKimlikNo?.trim()) {
    const tcExists = await prisma.customer.findFirst({
      where: { identityNo: legacy.tcKimlikNo.trim() },
    });
    if (tcExists) {
      throw codeError('CUSTOMER_TC_EXISTS', 'Bu TC kimlik numarası zaten kayıtlı.');
    }
  }

  const customer = await prisma.customer.create({
    data: {
      name: legacyDisplayName(legacy.ad, legacy.soyad),
      phone,
      identityNo: legacy.tcKimlikNo?.trim() || undefined,
      birthDate: legacy.dogumTarihi ?? undefined,
      note: legacy.adres ? `Arşiv adres: ${legacy.adres}` : undefined,
      legacyCustomerId: legacy.id,
    },
  });

  try {
    const odooPartnerId = await syncCustomerToOdoo({
      name: customer.name,
      phone: customer.phone,
      identityNo: customer.identityNo ?? undefined,
      birthDate: customer.birthDate ?? undefined,
      email: legacy.email ?? undefined,
      note: customer.note ?? undefined,
    });
    return await prisma.customer.update({
      where: { id: customer.id },
      data: { odooPartnerId },
    });
  } catch (err) {
    console.error('[Odoo] Legacy promote sync hatası:', err);
    return customer;
  }
}

export async function promoteLegacyCustomer(
  legacyId: string,
  options: { force?: boolean; mevcutMusteriId?: string } = {},
) {
  const legacy = await getLegacyCustomerDetail(legacyId);

  if (options.mevcutMusteriId) {
    const existing = await prisma.customer.findUnique({ where: { id: options.mevcutMusteriId } });
    if (!existing) {
      throw codeError('CUSTOMER_NOT_FOUND', 'Mevcut müşteri bulunamadı.');
    }
    const customer = await linkLegacyToCustomer(existing.id, legacy.id);
    return { possibleDuplicate: false as const, customer };
  }

  const alreadyLinked = await prisma.customer.findFirst({
    where: { legacyCustomerId: legacy.id },
  });
  if (alreadyLinked) {
    return { possibleDuplicate: false as const, customer: alreadyLinked };
  }

  if (!options.force) {
    const duplicate = await findPossibleDuplicate(legacy);
    if (duplicate) {
      return {
        possibleDuplicate: true as const,
        mevcutMusteri: {
          id: duplicate.id,
          name: duplicate.name,
          phone: duplicate.phone,
          identityNo: duplicate.identityNo,
          legacyCustomerId: duplicate.legacyCustomerId,
        },
      };
    }
  }

  const customer = await createCustomerFromLegacy(legacy);
  return { possibleDuplicate: false as const, customer };
}
