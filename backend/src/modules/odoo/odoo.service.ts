import * as xmlrpc from 'xmlrpc';

const ODOO_URL = process.env.ODOO_URL || (() => {
  throw new Error('ODOO_URL ortam değişkeni tanımlı değil — .env dosyasını kontrol edin');
})();

const ODOO_DB = process.env.ODOO_DB || (() => {
  throw new Error('ODOO_DB ortam değişkeni tanımlı değil — .env dosyasını kontrol edin');
})();

const ODOO_USER = process.env.ODOO_USER || (() => {
  throw new Error('ODOO_USER ortam değişkeni tanımlı değil — .env dosyasını kontrol edin');
})();

const ODOO_PASS = (process.env.ODOO_PASS ?? process.env.ODOO_PASSWORD) || (() => {
  throw new Error('ODOO_PASS veya ODOO_PASSWORD ortam değişkeni tanımlı değil — .env dosyasını kontrol edin');
})();

const common = xmlrpc.createClient({ url: `${ODOO_URL}/xmlrpc/2/common` });
const models = xmlrpc.createClient({ url: `${ODOO_URL}/xmlrpc/2/object` });

function call(client: xmlrpc.Client, method: string, params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (err: Object, val: any) => {
      if (err) reject(err);
      else resolve(val);
    });
  });
}

let cachedUid: number | null = null;

async function getUid(): Promise<number> {
  if (cachedUid) return cachedUid;
  const uid = await call(common, 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
  if (!uid || typeof uid !== 'number') {
    throw new Error('ODOO_AUTH_FAILED');
  }
  cachedUid = uid;
  return uid;
}

/** Şirket bazlı Odoo servis kullanıcıları */
export const SIRKET_ODOO_CREDENTIALS: Record<number, { uid: number; password: string }> = {
  1: { uid: 2, password: 'admin123' },
  2: { uid: 7, password: 'ng123' },
  3: { uid: 6, password: 'adese123' },
  4: { uid: 8, password: 'potential123' },
};

export const ODOO_ALL_COMPANY_IDS = [1, 2, 3, 4];

export function getOdooCredentials(companyId: number) {
  return SIRKET_ODOO_CREDENTIALS[companyId] ?? SIRKET_ODOO_CREDENTIALS[1];
}

export function buildOdooCompanyContext(forceCompanyId: number) {
  return {
    allowed_company_ids: [forceCompanyId],
    company_id: forceCompanyId,
  };
}

export async function execute(
  model: string,
  method: string,
  args: any[],
  kwargs: Record<string, any> = {},
  companyId?: number,
): Promise<any> {
  const finalKwargs = { ...kwargs };
  let uid: number;
  let password: string;

  if (companyId !== undefined && Number.isFinite(companyId) && companyId > 0) {
    const creds = getOdooCredentials(companyId);
    uid = creds.uid;
    password = creds.password;
    finalKwargs.context = {
      ...(finalKwargs.context ?? {}),
      ...buildOdooCompanyContext(companyId),
    };
  } else {
    uid = await getUid();
    password = ODOO_PASS;
  }

  return call(models, 'execute_kw', [ODOO_DB, uid, password, model, method, args, finalKwargs]);
}

export async function searchPartners(query: string) {
  return execute(
    'res.partner',
    'search_read',
    [[['name', 'ilike', query]]],
    { fields: ['id', 'name', 'phone', 'email'], limit: 10 },
  );
}

export async function createPartner(data: { name: string; phone?: string; email?: string }) {
  return execute('res.partner', 'create', [data]);
}

export async function getProducts(limit = 100) {
  return execute(
    'product.template',
    'search_read',
    [[['sale_ok', '=', true]]],
    { fields: ['id', 'name', 'list_price', 'default_code', 'barcode', 'type'], limit },
  );
}

export const ODOO_CATEGORY_MAP: Record<string, number> = {
  // Çerçeve
  'OPTICAL_FRAME_RX': 6,
  'OPTICAL_FRAME_READY': 6,
  // Güneş
  'SUNGLASSES_RX': 7,
  'SUNGLASSES_READY': 7,
  // Cam
  'LENS_RX': 4,
  // Lens
  'CONTACT_LENS_RX': 5,
  'CONTACT_LENS_READY': 5,
};

export async function getProductsByCategory(odooCategoryId: number, limit = 100) {
  return execute(
    'product.template',
    'search_read',
    [[['categ_id', 'child_of', odooCategoryId], ['sale_ok', '=', true]]],
    {
      fields: ['id', 'name', 'list_price', 'default_code', 'barcode', 'categ_id', 'type'],
      limit,
    },
  );
}

export async function createSaleOrder(data: {
  partner_id: number;
  order_line: Array<{ product_id: number; product_uom_qty: number; price_unit: number }>;
}) {
  const orderId = await execute('sale.order', 'create', [
    {
      partner_id: data.partner_id,
      order_line: data.order_line.map((line) => [
        0,
        0,
        {
          product_id: line.product_id,
          product_uom_qty: line.product_uom_qty,
          price_unit: line.price_unit,
        },
      ]),
    },
  ]);
  return orderId;
}

export async function confirmSaleOrder(odooOrderId: number) {
  return execute('sale.order', 'action_confirm', [[odooOrderId]]);
}

export async function syncCustomerToOdoo(customer: {
  name: string;
  phone?: string;
  identityNo?: string;
  birthDate?: Date | string | null;
  email?: string | null;
  note?: string | null;
}): Promise<number> {
  if (customer.phone) {
    const existing = await execute(
      'res.partner',
      'search_read',
      [[['phone', '=', customer.phone]]],
      { fields: ['id'], limit: 1 },
    );
    if (Array.isArray(existing) && existing.length > 0) return existing[0].id;
  }

  const partnerVals: any = {
    name: customer.name,
    phone: customer.phone,
    customer_rank: 1,
  }
  if (customer.identityNo) partnerVals.vat = customer.identityNo
  if (customer.email) partnerVals.email = customer.email
  if (customer.birthDate) {
    try {
      const d = new Date(customer.birthDate)
      if (!isNaN(d.getTime())) {
        partnerVals.x_birthdate = d.toISOString().slice(0, 10)
      }
    } catch { }
  }
  if (customer.note) partnerVals.comment = customer.note

  return execute('res.partner', 'create', [partnerVals])
}

export async function syncPrescriptionToOdoo(
  odooPartnerId: number,
  rx: {
    date?: string | null;
    source?: string | null;
    erx_no?: string | null;
    erx_hospital?: string | null;
    erx_doctor?: string | null;
    erx_diagnosis?: string | null;
    far_r_sph?: string | null; far_r_cyl?: string | null; far_r_aks?: string | null;
    far_r_pd?: string | null;  far_r_add?: string | null; far_r_note?: string | null;
    far_l_sph?: string | null; far_l_cyl?: string | null; far_l_aks?: string | null;
    far_l_pd?: string | null;  far_l_add?: string | null; far_l_note?: string | null;
    near_r_sph?: string | null; near_r_cyl?: string | null; near_r_aks?: string | null;
    near_r_pd?: string | null;  near_r_note?: string | null;
    near_l_sph?: string | null; near_l_cyl?: string | null; near_l_aks?: string | null;
    near_l_pd?: string | null;  near_l_note?: string | null;
    lens_r_bc?: string | null;  lens_r_sph?: string | null; lens_r_cyl?: string | null;
    lens_r_aks?: string | null; lens_r_add?: string | null; lens_r_note?: string | null;
    lens_l_bc?: string | null;  lens_l_sph?: string | null; lens_l_cyl?: string | null;
    lens_l_aks?: string | null; lens_l_add?: string | null; lens_l_note?: string | null;
  }
): Promise<number> {
  const vals: any = { partner_id: odooPartnerId };
  const rawDate = (rx as any).date ?? (rx as any).erx_date ?? (rx as any).eRx_date;
  if (rawDate) vals.date = String(rawDate).slice(0, 10);
  if (rx.source) vals.source = rx.source;
  if (rx.erx_no) vals.erx_no = rx.erx_no;
  if (rx.erx_hospital) vals.erx_hospital = rx.erx_hospital;
  if (rx.erx_doctor) vals.erx_doctor = rx.erx_doctor;
  if (rx.erx_diagnosis) vals.erx_diagnosis = rx.erx_diagnosis;
  const fields = [
    'far_r_sph','far_r_cyl','far_r_aks','far_r_pd','far_r_add','far_r_note',
    'far_l_sph','far_l_cyl','far_l_aks','far_l_pd','far_l_add','far_l_note',
    'near_r_sph','near_r_cyl','near_r_aks','near_r_pd','near_r_note',
    'near_l_sph','near_l_cyl','near_l_aks','near_l_pd','near_l_note',
    'lens_r_bc','lens_r_sph','lens_r_cyl','lens_r_aks','lens_r_add','lens_r_note',
    'lens_l_bc','lens_l_sph','lens_l_cyl','lens_l_aks','lens_l_add','lens_l_note',
  ];
  for (const f of fields) {
    if ((rx as any)[f]) vals[f] = (rx as any)[f];
  }
  return execute('guven.prescription', 'create', [vals]);
}

export async function appendPartnerNote(odooPartnerId: number, noteText: string) {
  try {
    const [partner] = await execute('res.partner', 'read', [[odooPartnerId]], {
      fields: ['comment'],
    });
    const existing = partner?.comment ?? '';
    const dateStr = new Date().toLocaleDateString('tr-TR');
    const newLine = `[${dateStr}] ${noteText}`;
    const updated = existing ? `${existing}\n${newLine}` : newLine;
    await execute('res.partner', 'write', [[odooPartnerId], { comment: updated }]);
  } catch (e) {
    console.error('appendPartnerNote failed', e);
  }
}
