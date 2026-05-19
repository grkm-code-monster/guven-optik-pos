import * as xmlrpc from 'xmlrpc';

const ODOO_URL = process.env.ODOO_URL ?? 'http://localhost:8069';
const ODOO_DB = process.env.ODOO_DB ?? 'guvenoptik';
const ODOO_USER = process.env.ODOO_USER ?? 'admin';
const ODOO_PASS = process.env.ODOO_PASS ?? process.env.ODOO_PASSWORD ?? 'admin123';

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
    allowed_company_ids: [...ODOO_ALL_COMPANY_IDS],
    force_company: forceCompanyId,
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
  'SUNGLASSES_RX': 5,
  'SUNGLASSES_READY': 5,
  // Cam
  'LENS_RX': 4,
  // Lens
  'CONTACT_LENS_RX': 7,
  'CONTACT_LENS_READY': 7,
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

  return execute('res.partner', 'create', [
    {
      name: customer.name,
      phone: customer.phone,
      vat: customer.identityNo,
      customer_rank: 1,
    },
  ]);
}
