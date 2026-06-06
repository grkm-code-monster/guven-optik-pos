import { prisma } from '../../database/prisma';
import { syncCustomerToOdoo } from '../odoo/odoo.service';

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

export async function searchCustomers(q: string) {
  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { phone: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: {
      sales: {
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  return customers.map((c) => ({
    ...c,
    lastSaleAt: c.sales[0]?.createdAt ?? null,
    sales: undefined,
  }));
}

export async function createCustomer(input: any) {
  const existing = await prisma.customer.findUnique({
    where: { phone: input.phone },
  });
  if (existing) {
    throw codeError('CUSTOMER_PHONE_EXISTS', 'Bu telefon numarası zaten kayıtlı.');
  }

  const customer = await prisma.customer.create({
    data: {
      name: input.name,
      phone: input.phone,
      note: input.note,
      identityNo: input.identityNo,
      birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
      hasPresciption: input.hasPresciption ?? false,
      far_r_pd: input.far_r_pd,
      far_r_sph: input.far_r_sph,
      far_r_cyl: input.far_r_cyl,
      far_r_aks: input.far_r_aks,
      far_r_diagnosis: input.far_r_diagnosis,
      far_l_pd: input.far_l_pd,
      far_l_sph: input.far_l_sph,
      far_l_cyl: input.far_l_cyl,
      far_l_aks: input.far_l_aks,
      far_l_diagnosis: input.far_l_diagnosis,
      near_r_pd: input.near_r_pd,
      near_r_sph: input.near_r_sph,
      near_r_cyl: input.near_r_cyl,
      near_r_aks: input.near_r_aks,
      near_r_diagnosis: input.near_r_diagnosis,
      near_l_pd: input.near_l_pd,
      near_l_sph: input.near_l_sph,
      near_l_cyl: input.near_l_cyl,
      near_l_aks: input.near_l_aks,
      near_l_diagnosis: input.near_l_diagnosis,
      lens_r_bc: input.lens_r_bc,
      lens_r_sph: input.lens_r_sph,
      lens_r_cyl: input.lens_r_cyl,
      lens_r_aks: input.lens_r_aks,
      lens_r_add: input.lens_r_add,
      lens_l_bc: input.lens_l_bc,
      lens_l_sph: input.lens_l_sph,
      lens_l_cyl: input.lens_l_cyl,
      lens_l_aks: input.lens_l_aks,
      lens_l_add: input.lens_l_add,
      eRx_no: input.eRx_no,
      eRx_date: input.eRx_date,
      eRx_hospital: input.eRx_hospital,
      eRx_doctor: input.eRx_doctor,
      eRx_diagnosis: input.eRx_diagnosis,
    },
  });

  try {
    const odooPartnerId = await syncCustomerToOdoo({
      name: customer.name,
      phone: customer.phone,
      identityNo: customer.identityNo ?? undefined,
      birthDate: customer.birthDate ?? undefined,
      email: input.ePostaEmail ?? undefined,
      note: customer.note ?? undefined,
    });
    await prisma.customer.update({
      where: { id: customer.id },
      data: { odooPartnerId },
    });
    return { ...customer, odooPartnerId };
  } catch (err) {
    console.error('[Odoo] Müşteri sync hatası:', err);
    return customer;
  }
}

export async function updateCustomer(id: string, input: any) {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) {
    throw codeError('CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  }
  if (input.phone && input.phone !== existing.phone) {
    const other = await prisma.customer.findUnique({ where: { phone: input.phone } });
    if (other) {
      throw codeError('CUSTOMER_PHONE_EXISTS', 'Bu telefon numarası zaten kayıtlı.');
    }
  }

  const updated = await prisma.customer.update({
    where: { id },
    data: {
      name: input.name,
      phone: input.phone,
      note: input.note,
      identityNo: input.identityNo,
      birthDate: input.birthDate ? new Date(input.birthDate) : input.birthDate === null ? null : undefined,
      hasPresciption: typeof input.hasPresciption === 'boolean' ? input.hasPresciption : undefined,
      far_r_pd: input.far_r_pd,
      far_r_sph: input.far_r_sph,
      far_r_cyl: input.far_r_cyl,
      far_r_aks: input.far_r_aks,
      far_r_diagnosis: input.far_r_diagnosis,
      far_l_pd: input.far_l_pd,
      far_l_sph: input.far_l_sph,
      far_l_cyl: input.far_l_cyl,
      far_l_aks: input.far_l_aks,
      far_l_diagnosis: input.far_l_diagnosis,
      near_r_pd: input.near_r_pd,
      near_r_sph: input.near_r_sph,
      near_r_cyl: input.near_r_cyl,
      near_r_aks: input.near_r_aks,
      near_r_diagnosis: input.near_r_diagnosis,
      near_l_pd: input.near_l_pd,
      near_l_sph: input.near_l_sph,
      near_l_cyl: input.near_l_cyl,
      near_l_aks: input.near_l_aks,
      near_l_diagnosis: input.near_l_diagnosis,
      lens_r_bc: input.lens_r_bc,
      lens_r_sph: input.lens_r_sph,
      lens_r_cyl: input.lens_r_cyl,
      lens_r_aks: input.lens_r_aks,
      lens_r_add: input.lens_r_add,
      lens_l_bc: input.lens_l_bc,
      lens_l_sph: input.lens_l_sph,
      lens_l_cyl: input.lens_l_cyl,
      lens_l_aks: input.lens_l_aks,
      lens_l_add: input.lens_l_add,
      eRx_no: input.eRx_no,
      eRx_date: input.eRx_date,
      eRx_hospital: input.eRx_hospital,
      eRx_doctor: input.eRx_doctor,
      eRx_diagnosis: input.eRx_diagnosis,
    },
  });

  return updated;
}

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      sales: {
        select: { id: true, createdAt: true, netTotal: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!customer) {
    throw codeError('CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  }

  return customer;
}

export async function addPrescription(customerId: string, input: any) {
  const existing = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!existing) {
    throw codeError('CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  }

  const created = await prisma.customerPrescription.create({
    data: {
      customerId,
      date: input.date ? new Date(input.date) : undefined,
      source: input.source,

      far_r_pd: input.far_r_pd,
      far_r_sph: input.far_r_sph,
      far_r_cyl: input.far_r_cyl,
      far_r_aks: input.far_r_aks,
      far_r_note: input.far_r_note,
      far_l_pd: input.far_l_pd,
      far_l_sph: input.far_l_sph,
      far_l_cyl: input.far_l_cyl,
      far_l_aks: input.far_l_aks,
      far_l_note: input.far_l_note,

      near_r_pd: input.near_r_pd,
      near_r_sph: input.near_r_sph,
      near_r_cyl: input.near_r_cyl,
      near_r_aks: input.near_r_aks,
      near_r_note: input.near_r_note,
      near_l_pd: input.near_l_pd,
      near_l_sph: input.near_l_sph,
      near_l_cyl: input.near_l_cyl,
      near_l_aks: input.near_l_aks,
      near_l_note: input.near_l_note,

      lens_r_bc: input.lens_r_bc,
      lens_r_sph: input.lens_r_sph,
      lens_r_cyl: input.lens_r_cyl,
      lens_r_aks: input.lens_r_aks,
      lens_r_add: input.lens_r_add,
      lens_r_note: input.lens_r_note,
      lens_l_bc: input.lens_l_bc,
      lens_l_sph: input.lens_l_sph,
      lens_l_cyl: input.lens_l_cyl,
      lens_l_aks: input.lens_l_aks,
      lens_l_add: input.lens_l_add,
      lens_l_note: input.lens_l_note,

      eRx_no: input.eRx_no,
      eRx_date: input.eRx_date,
      eRx_hospital: input.eRx_hospital,
      eRx_doctor: input.eRx_doctor,
      eRx_diagnosis: input.eRx_diagnosis,
    },
  });

  try {
    const { syncCustomerToOdoo, syncPrescriptionToOdoo } = await import('../odoo/odoo.service');
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (customer) {
      const odooId = await syncCustomerToOdoo({ name: customer.name, phone: customer.phone ?? undefined });
      console.log('[Odoo] syncPrescription input:', JSON.stringify({
        date: input.date,
        erx_date: input.eRx_date,
        source: input.source,
      }, null, 2));
      await syncPrescriptionToOdoo(odooId, {
        date: input.date ?? input.eRx_date,
        source: input.source,
        erx_no: input.eRx_no,
        erx_hospital: input.eRx_hospital,
        erx_doctor: input.eRx_doctor,
        erx_diagnosis: input.eRx_diagnosis,
        far_r_sph: input.far_r_sph, far_r_cyl: input.far_r_cyl, far_r_aks: input.far_r_aks,
        far_r_pd: input.far_r_pd, far_r_add: input.far_r_add, far_r_note: input.far_r_note,
        far_l_sph: input.far_l_sph, far_l_cyl: input.far_l_cyl, far_l_aks: input.far_l_aks,
        far_l_pd: input.far_l_pd, far_l_add: input.far_l_add, far_l_note: input.far_l_note,
        near_r_sph: input.near_r_sph, near_r_cyl: input.near_r_cyl, near_r_aks: input.near_r_aks,
        near_r_pd: input.near_r_pd, near_r_note: input.near_r_note,
        near_l_sph: input.near_l_sph, near_l_cyl: input.near_l_cyl, near_l_aks: input.near_l_aks,
        near_l_pd: input.near_l_pd, near_l_note: input.near_l_note,
        lens_r_bc: input.lens_r_bc, lens_r_sph: input.lens_r_sph, lens_r_cyl: input.lens_r_cyl,
        lens_r_aks: input.lens_r_aks, lens_r_add: input.lens_r_add, lens_r_note: input.lens_r_note,
        lens_l_bc: input.lens_l_bc, lens_l_sph: input.lens_l_sph, lens_l_cyl: input.lens_l_cyl,
        lens_l_aks: input.lens_l_aks, lens_l_add: input.lens_l_add, lens_l_note: input.lens_l_note,
      });
    }
  } catch (e) {
    console.error('[Odoo] Reçete sync hatası:', e);
  }

  return created;
}

export async function getCustomerPrescriptions(customerId: string) {
  const existing = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!existing) {
    throw codeError('CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  }

  return await prisma.customerPrescription.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getLatestPrescription(customerId: string) {
  const existing = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!existing) {
    throw codeError('CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  }

  return await prisma.customerPrescription.findFirst({
    where: { customerId },
    orderBy: [{ createdAt: 'desc' }],
  });
}

function formatDaimiSummary(p: {
  far_r_sph?: string | null
  far_r_cyl?: string | null
  far_r_aks?: string | null
  far_l_sph?: string | null
  far_l_cyl?: string | null
  far_l_aks?: string | null
}): string {
  const eye = (side: 'r' | 'l') => {
    const sph = p[`far_${side}_sph`]?.trim() || '—'
    const cyl = p[`far_${side}_cyl`]?.trim() || '—'
    const aks = p[`far_${side}_aks`]?.trim() || '—'
    if (!p[`far_${side}_sph`] && !p[`far_${side}_cyl`] && !p[`far_${side}_aks`]) return null
    return `${sph}/${cyl}/${aks}`
  }
  const parts: string[] = []
  const r = eye('r')
  const l = eye('l')
  if (r) parts.push(`R: ${r}`)
  if (l) parts.push(`L: ${l}`)
  if (!parts.length) return ''
  return `Daimi ${parts.join(' · ')}`
}

/** Müşteri reçete geçmişi (CustomerPrescription, en yeni önce, max 10) */
export async function getReceteGecmisi(customerId: string) {
  const list = await getCustomerPrescriptions(customerId)
  return list.slice(0, 10).map((p) => ({
    ...p,
    summary: formatDaimiSummary(p),
    saleDate: p.createdAt,
    sortDate: p.createdAt,
  }))
}

