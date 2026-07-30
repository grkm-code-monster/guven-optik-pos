/**
 * Odoo'da stock.location kayıtlarını isme göre arayıp ID/şirket bilgisini basar.
 * Kullanım: node scripts/odoo-find-location.js GVN7
 *           node scripts/odoo-find-location.js Eticaret
 * .env dosyasındaki ODOO_URL/ODOO_DB/ODOO_USER/ODOO_PASS bilgilerini kullanır.
 */
require('dotenv/config');
const xmlrpc = require('xmlrpc');

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_USER;
const ODOO_PASS = process.env.ODOO_PASS || process.env.ODOO_PASSWORD;

if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_PASS) {
  console.error('ODOO_URL / ODOO_DB / ODOO_USER / ODOO_PASS .env içinde eksik.');
  process.exit(1);
}

const common = xmlrpc.createClient({ url: `${ODOO_URL}/xmlrpc/2/common` });
const models = xmlrpc.createClient({ url: `${ODOO_URL}/xmlrpc/2/object` });

function call(client, method, params) {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (err, val) => (err ? reject(err) : resolve(val)));
  });
}

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Kullanım: node scripts/odoo-find-location.js <arama-metni>');
    process.exit(1);
  }

  const uid = await call(common, 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
  if (!uid || typeof uid !== 'number') throw new Error('Odoo kimlik doğrulama başarısız.');

  const rows = await call(models, 'execute_kw', [
    ODOO_DB,
    uid,
    ODOO_PASS,
    'stock.location',
    'search_read',
    [[['complete_name', 'ilike', query]]],
    {
      fields: ['id', 'complete_name', 'company_id', 'usage'],
      context: { allowed_company_ids: [1, 2, 3, 4] },
    },
  ]);

  if (!rows.length) {
    console.log(`"${query}" ile eşleşen lokasyon bulunamadı.`);
    return;
  }

  for (const r of rows) {
    const company = Array.isArray(r.company_id) ? r.company_id[1] : '—';
    console.log(`id=${r.id}  şirket=${company}  usage=${r.usage}  ad=${r.complete_name}`);
  }
}

main().catch((e) => {
  console.error('Hata:', e?.message ?? e);
  process.exit(1);
});
