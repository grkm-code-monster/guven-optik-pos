/**
 * NG/ADESE/POTENTIAL servis kullanıcıları — account.tax okuma izni teşhis + düzeltme
 *
 * Kullanım:
 *   npx ts-node scripts/fix-servis-account-tax-access.ts
 *   npx ts-node scripts/fix-servis-account-tax-access.ts --dry-run
 */
import 'dotenv/config';
import * as xmlrpc from 'xmlrpc';
import { SIRKET_ODOO_CREDENTIALS } from '../src/modules/odoo/odoo.service';

const ODOO_URL = process.env.ODOO_URL ?? 'http://localhost:8069';
const ODOO_DB = process.env.ODOO_DB ?? 'odoo';
const ODOO_USER = process.env.ODOO_USER ?? 'admin';
const ODOO_PASS = process.env.ODOO_PASS ?? process.env.ODOO_PASSWORD ?? 'admin123';
const DRY_RUN = process.argv.includes('--dry-run');

/** Talimattaki uid=2; execute_kw doğrudan uid+password ile çalışır */
const ADMIN_UID = SIRKET_ODOO_CREDENTIALS[1].uid;
const ADMIN_PASS = SIRKET_ODOO_CREDENTIALS[1].password;

const SERVIS_KULLANICILARI = [
  { etiket: 'NG Servis', companyId: 2, uid: 7, password: 'ng123' },
  { etiket: 'ADESE Servis', companyId: 3, uid: 6, password: 'adese123' },
  { etiket: 'POTENTIAL Servis', companyId: 4, uid: 8, password: 'potential123' },
] as const;

const common = xmlrpc.createClient({ url: `${ODOO_URL}/xmlrpc/2/common` });
const models = xmlrpc.createClient({ url: `${ODOO_URL}/xmlrpc/2/object` });

function call(client: xmlrpc.Client, method: string, params: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (err: object | null, val: unknown) => {
      if (err) reject(err);
      else resolve(val);
    });
  });
}

async function authenticateLogin(login: string, password: string): Promise<number> {
  const authUid = await call(common, 'authenticate', [ODOO_DB, login, password, {}]);
  if (!authUid || typeof authUid !== 'number') {
    throw new Error(`Kimlik doğrulama başarısız (login=${login})`);
  }
  return authUid;
}

async function resolveAdminSession(): Promise<{ uid: number; password: string; via: string }> {
  const envUid = await authenticateLogin(ODOO_USER, ODOO_PASS);
  if (envUid === ADMIN_UID) {
    return { uid: envUid, password: ODOO_PASS, via: `ODOO_USER=${ODOO_USER} (uid=${ADMIN_UID})` };
  }
  // env admin farklı uid döndürdüyse talimattaki uid=2 ile dene (execute_kw login değil uid kullanır)
  try {
    await executeKw(ADMIN_UID, ADMIN_PASS, 'res.users', 'read', [[ADMIN_UID]], { fields: ['id'], limit: 1 });
    return { uid: ADMIN_UID, password: ADMIN_PASS, via: `SIRKET_ODOO_CREDENTIALS[1] uid=${ADMIN_UID}` };
  } catch {
    return { uid: envUid, password: ODOO_PASS, via: `ODOO_USER=${ODOO_USER} (uid=${envUid}, talimattaki uid=${ADMIN_UID} değil)` };
  }
}

async function executeKw(
  uid: number,
  password: string,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<unknown> {
  return call(models, 'execute_kw', [ODOO_DB, uid, password, model, method, args, kwargs]);
}

function m2oId(field: unknown): number | null {
  if (Array.isArray(field) && typeof field[0] === 'number') return field[0];
  if (typeof field === 'number') return field;
  return null;
}

function m2oName(field: unknown): string {
  if (Array.isArray(field) && typeof field[1] === 'string') return field[1];
  if (typeof field === 'string') return field;
  return '';
}

type AccessRow = {
  id: number;
  name: string;
  group_id: unknown;
  perm_read: boolean;
  perm_write: boolean;
  perm_create: boolean;
  perm_unlink: boolean;
};

type GroupRow = { id: number; name: string; full_name?: string; category_id?: unknown };

async function getAccountTaxModelId(adminUid: number, adminPass: string): Promise<number> {
  const rows = (await executeKw(adminUid, adminPass, 'ir.model', 'search_read', [
    [['model', '=', 'account.tax']],
  ], { fields: ['id', 'model', 'name'], limit: 1 })) as Array<{ id: number; model: string; name: string }>;
  if (!rows[0]?.id) throw new Error('ir.model account.tax bulunamadı');
  return rows[0].id;
}

async function listAccountTaxAccess(adminUid: number, adminPass: string, modelId: number): Promise<AccessRow[]> {
  return (await executeKw(adminUid, adminPass, 'ir.model.access', 'search_read', [
    [['model_id', '=', modelId]],
  ], {
    fields: ['name', 'group_id', 'perm_read', 'perm_write', 'perm_create', 'perm_unlink'],
    limit: 200,
  })) as AccessRow[];
}

async function getUserGroups(adminUid: number, adminPass: string, userId: number) {
  const users = (await executeKw(adminUid, adminPass, 'res.users', 'read', [[userId]], {
    fields: ['id', 'login', 'name', 'groups_id'],
  })) as Array<{ id: number; login: string; name: string; groups_id: number[] }>;
  const user = users[0];
  if (!user) throw new Error(`res.users id=${userId} bulunamadı`);
  const groupIds = user.groups_id ?? [];
  let groups: GroupRow[] = [];
  if (groupIds.length) {
    groups = (await executeKw(adminUid, adminPass, 'res.groups', 'read', [groupIds], {
      fields: ['id', 'name', 'full_name', 'category_id'],
    })) as GroupRow[];
  }
  return { user, groups };
}

async function resolveXmlGroupId(adminUid: number, adminPass: string, module: string, name: string): Promise<number | null> {
  const rows = (await executeKw(adminUid, adminPass, 'ir.model.data', 'search_read', [
    [['module', '=', module], ['name', '=', name], ['model', '=', 'res.groups']],
  ], { fields: ['res_id'], limit: 1 })) as Array<{ res_id: number }>;
  return rows[0]?.res_id ?? null;
}

function userHasReadViaGroups(groupIds: number[], accessRows: AccessRow[]): boolean {
  const readableGroupIds = new Set(
    accessRows.filter((a) => a.perm_read && m2oId(a.group_id)).map((a) => m2oId(a.group_id) as number),
  );
  return groupIds.some((gid) => readableGroupIds.has(gid));
}

function pickTargetGroup(groupIds: number[], groups: GroupRow[], accountManagerGroupId: number | null): number | null {
  const byId = new Map(groups.map((g) => [g.id, g]));
  if (accountManagerGroupId && groupIds.includes(accountManagerGroupId)) {
    return accountManagerGroupId;
  }
  for (const gid of groupIds) {
    const g = byId.get(gid);
    const label = `${g?.full_name ?? ''} ${g?.name ?? ''}`.toLowerCase();
    if (label.includes('faturalandırma') || label.includes('billing') || label.includes('account')) {
      return gid;
    }
  }
  return groupIds[0] ?? null;
}

function printAccessTable(title: string, accessRows: AccessRow[], highlightGroupIds?: number[]) {
  console.log(`\n${title}`);
  if (!accessRows.length) {
    console.log('  (kayıt yok)');
    return;
  }
  for (const row of accessRows) {
    const gid = m2oId(row.group_id);
    const marker = highlightGroupIds?.includes(gid ?? -1) ? ' ◀ kullanıcı grubu' : '';
    console.log(
      `  id=${row.id} group=${gid ?? 'GLOBAL'} (${m2oName(row.group_id) || 'tüm kullanıcılar'})` +
      ` read=${row.perm_read} write=${row.perm_write} create=${row.perm_create} unlink=${row.perm_unlink}` +
      ` name="${row.name}"${marker}`,
    );
  }
}

async function ensureGroupReadAccess(
  adminUid: number,
  adminPass: string,
  modelId: number,
  groupId: number,
  groupLabel: string,
  servisEtiket: string,
): Promise<'created' | 'updated' | 'unchanged'> {
  const existing = (await executeKw(adminUid, adminPass, 'ir.model.access', 'search_read', [
    [['model_id', '=', modelId], ['group_id', '=', groupId]],
  ], {
    fields: ['id', 'name', 'perm_read', 'perm_write', 'perm_create', 'perm_unlink'],
    limit: 1,
  })) as AccessRow[];

  if (existing[0]) {
    const row = existing[0];
    if (row.perm_read && !row.perm_write && !row.perm_create && !row.perm_unlink) {
      return 'unchanged';
    }
    if (DRY_RUN) {
      console.log(`  [dry-run] ir.model.access id=${row.id} → perm_read=True (write/create/unlink=False)`);
      return 'updated';
    }
    await executeKw(adminUid, adminPass, 'ir.model.access', 'write', [[row.id], {
      perm_read: true,
      perm_write: false,
      perm_create: false,
      perm_unlink: false,
    }]);
    console.log(`  ✓ ir.model.access id=${row.id} güncellendi (perm_read=True)`);
    return 'updated';
  }

  const name = `account.tax read — ${servisEtiket} (${groupLabel})`;
  if (DRY_RUN) {
    console.log(`  [dry-run] yeni ir.model.access create: group_id=${groupId}, perm_read=True`);
    return 'created';
  }
  const newId = await executeKw(adminUid, adminPass, 'ir.model.access', 'create', [{
    name,
    model_id: modelId,
    group_id: groupId,
    perm_read: true,
    perm_write: false,
    perm_create: false,
    perm_unlink: false,
  }]);
  console.log(`  ✓ yeni ir.model.access id=${newId} oluşturuldu (group_id=${groupId})`);
  return 'created';
}

async function testTransferSenaryolari(
  adminUid: number,
  adminPass: string,
  servis: (typeof SERVIS_KULLANICILARI)[number],
) {
  console.log(`\n--- Transfer senaryosu: ${servis.etiket} ---`);

  // Chart şirketi (1) vergileri — odoo-tax.util fallback
  const chartTaxes = (await executeKw(adminUid, adminPass, 'account.tax', 'search_read', [[
    ['company_id', '=', 1],
    ['active', '=', true],
    ['type_tax_use', '=', 'sale'],
  ]], {
    fields: ['id', 'name', 'amount', 'company_id'],
    limit: 3,
    context: { allowed_company_ids: [1], company_id: 1 },
  })) as Array<{ id: number; name: string; amount: number }>;

  if (!chartTaxes[0]) {
    console.log('  (company=1 satış vergisi bulunamadı — atlandı)');
    return;
  }
  const taxId = chartTaxes[0].id;
  console.log(`  Chart vergi örneği: id=${taxId} "${chartTaxes[0].name}"`);

  for (const [label, companyId] of [
    [`kendi şirket ctx (${servis.companyId})`, servis.companyId],
    ['chart şirket ctx (1)', 1],
    [`çoklu şirket ctx [1,${servis.companyId}]`, servis.companyId],
  ] as const) {
    const ctx =
      label.startsWith('çoklu')
        ? { allowed_company_ids: [1, servis.companyId], company_id: servis.companyId }
        : { allowed_company_ids: [companyId], company_id: companyId };
    try {
      await executeKw(servis.uid, servis.password, 'account.tax', 'read', [[taxId]], {
        fields: ['id', 'name', 'amount'],
        context: ctx,
      });
      console.log(`  ✓ account.tax read id=${taxId} — ${label}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ account.tax read id=${taxId} — ${label}: ${msg.slice(0, 220)}`);
    }
  }

  // readProductSaleTaxRate benzeri: ürün taxes_id → account.tax read
  const products = (await executeKw(adminUid, adminPass, 'product.product', 'search_read', [[
    ['taxes_id', '!=', false],
  ]], {
    fields: ['id', 'display_name', 'taxes_id'],
    limit: 1,
  })) as Array<{ id: number; display_name: string; taxes_id: number[] }>;

  if (products[0]?.taxes_id?.length) {
    const pid = products[0].id;
    const taxIds = products[0].taxes_id;
    console.log(`  Ürün örneği: id=${pid} taxes_id=[${taxIds.join(',')}]`);
    try {
      await executeKw(servis.uid, servis.password, 'product.product', 'read', [[pid]], {
        fields: ['taxes_id'],
        context: { allowed_company_ids: [servis.companyId], company_id: servis.companyId },
      });
      console.log(`  ✓ product.product read (uid=${servis.uid}, company=${servis.companyId})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ product.product read: ${msg.slice(0, 180)}`);
    }
    try {
      await executeKw(servis.uid, servis.password, 'account.tax', 'read', [taxIds], {
        fields: ['id', 'amount', 'type_tax_use'],
        context: { allowed_company_ids: [servis.companyId], company_id: servis.companyId },
      });
      console.log(`  ✓ account.tax read taxes_id (company=${servis.companyId})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ account.tax read taxes_id (company=${servis.companyId}): ${msg.slice(0, 220)}`);
    }
  }
}

async function listRecordRules(adminUid: number, adminPass: string, modelId: number) {
  const rules = (await executeKw(adminUid, adminPass, 'ir.rule', 'search_read', [[
    ['model_id', '=', modelId],
  ]], {
    fields: ['id', 'name', 'domain_force', 'groups', 'perm_read', 'global'],
    limit: 50,
  })) as Array<{ id: number; name: string; domain_force: string; groups: number[]; global: boolean }>;
  console.log('\n=== account.tax ir.rule (kayıt kuralları) ===');
  if (!rules.length) {
    console.log('  (kural yok)');
    return;
  }
  for (const r of rules) {
    console.log(`  id=${r.id} global=${r.global} groups=${r.groups?.length ? r.groups.join(',') : '-'} name="${r.name}"`);
    if (r.domain_force) console.log(`    domain: ${r.domain_force.slice(0, 120)}`);
  }
}

async function testAccountTaxRead(
  etiket: string,
  uid: number,
  password: string,
  companyId: number,
): Promise<boolean> {
  try {
    const rows = (await executeKw(uid, password, 'account.tax', 'search_read', [[]], {
      fields: ['id', 'name', 'amount'],
      limit: 3,
      context: { allowed_company_ids: [companyId], company_id: companyId },
    })) as Array<{ id: number; name: string; amount: number }>;
    console.log(`  ✓ ${etiket} (uid=${uid}, company=${companyId}) account.tax okudu: ${rows.length} kayıt`);
    if (rows[0]) console.log(`    örnek: id=${rows[0].id} name="${rows[0].name}" amount=${rows[0].amount}`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ✗ ${etiket} (uid=${uid}) account.tax OKUYAMADI: ${msg.slice(0, 200)}`);
    return false;
  }
}

async function main() {
  console.log(`Odoo: ${ODOO_URL} db=${ODOO_DB} dryRun=${DRY_RUN}`);

  const admin = await resolveAdminSession();
  console.log(`Admin oturum: ${admin.via}`);

  const modelId = await getAccountTaxModelId(admin.uid, admin.password);
  console.log(`account.tax model_id=${modelId}`);

  const accessBefore = await listAccountTaxAccess(admin.uid, admin.password, modelId);
  printAccessTable('=== account.tax ir.model.access (ÖNCE) ===', accessBefore);
  await listRecordRules(admin.uid, admin.password, modelId);

  const accountManagerGroupId = await resolveXmlGroupId(admin.uid, admin.password, 'account', 'group_account_manager');
  if (accountManagerGroupId) {
    console.log(`\naccount.group_account_manager → res.groups id=${accountManagerGroupId}`);
  }

  const fixSummary: Array<{ etiket: string; action: string; groupId: number | null }> = [];

  for (const servis of SERVIS_KULLANICILARI) {
    console.log(`\n=== ${servis.etiket} (uid=${servis.uid}, companyId=${servis.companyId}) ===`);
    const { user, groups } = await getUserGroups(admin.uid, admin.password, servis.uid);
    console.log(`Kullanıcı: ${user.name} (${user.login})`);
    console.log(`Grup sayısı: ${groups.length}`);
    for (const g of groups) {
      const cat = m2oName(g.category_id);
      console.log(`  - id=${g.id} ${g.full_name ?? g.name}${cat ? ` [${cat}]` : ''}`);
    }

    const groupIds = groups.map((g) => g.id);
    printAccessTable('  Kullanıcı gruplarına ait account.tax erişimleri:', accessBefore.filter((a) => {
      const gid = m2oId(a.group_id);
      return gid != null && groupIds.includes(gid);
    }), groupIds);

    const canReadBefore = userHasReadViaGroups(groupIds, accessBefore);
    console.log(`perm_read (grup bazlı, önce): ${canReadBefore ? 'EVET' : 'HAYIR'}`);

    const preTest = await testAccountTaxRead(`${servis.etiket} (önce)`, servis.uid, servis.password, servis.companyId);

    if (canReadBefore && preTest) {
      console.log('  → ir.model.access düzeltmesi gerekmiyor.');
      fixSummary.push({ etiket: servis.etiket, action: 'ok_already', groupId: null });
      continue;
    }

    const targetGroupId = pickTargetGroup(groupIds, groups, accountManagerGroupId);
    if (!targetGroupId) {
      console.log('  ✗ Kullanıcının hiç grubu yok — düzeltme atlandı.');
      fixSummary.push({ etiket: servis.etiket, action: 'skipped_no_group', groupId: null });
      continue;
    }
    const targetGroup = groups.find((g) => g.id === targetGroupId);
    const targetLabel = targetGroup?.full_name ?? targetGroup?.name ?? String(targetGroupId);
    console.log(`Hedef grup: id=${targetGroupId} (${targetLabel})`);

    const action = await ensureGroupReadAccess(
      admin.uid,
      admin.password,
      modelId,
      targetGroupId,
      targetLabel,
      servis.etiket,
    );
    fixSummary.push({ etiket: servis.etiket, action, groupId: targetGroupId });
  }

  const accessAfter = await listAccountTaxAccess(admin.uid, admin.password, modelId);
  printAccessTable('\n=== account.tax ir.model.access (SONRA) ===', accessAfter);

  console.log('\n=== DOĞRUDAN OKUMA TESTİ (SONRA) ===');
  for (const servis of SERVIS_KULLANICILARI) {
    await testAccountTaxRead(servis.etiket, servis.uid, servis.password, servis.companyId);
  }

  console.log('\n=== TRANSFER SENARYOSU (chart vergi + ürün taxes_id) ===');
  for (const servis of SERVIS_KULLANICILARI) {
    await testTransferSenaryolari(admin.uid, admin.password, servis);
  }

  console.log('\n=== ÖZET ===');
  console.log('  ir.model.access: üç servis kullanıcısı da zaten perm_read=True gruplarında (26 Billing, 28 Billing Admin, vb.)');
  console.log('  Transfer hatası: chart vergi (company=1) tek-şirket ctx ile read → AccessError; çoklu ctx [1,N] ile OK');
  console.log('  Kod düzeltmesi: odoo-tax.util.ts readProductSaleTaxRate → allowed_company_ids [1, activeCompany]');
  for (const s of fixSummary) {
    console.log(`  ${s.etiket}: ${s.action}${s.groupId ? ` (group_id=${s.groupId})` : ''}`);
  }
  if (DRY_RUN) {
    console.log('\nDry-run modu — Odoo\'da değişiklik yapılmadı.');
  } else {
    console.log('\nGörkem canlı ekranda "Şirketler arası" transferi tekrar deneyebilir.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
