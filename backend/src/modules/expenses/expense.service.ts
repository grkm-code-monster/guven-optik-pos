import { execute } from '../odoo/odoo.service';

/**
 * Odoo'dan masraf kategorilerini çek (can_be_expensed = true).
 *
 * DÜZELTME (14.10.2026): burası önceden 'product.template' sorguluyordu ve
 * dönen id'ler doğrudan frontend'de saklanıp createExpense'e "product_id"
 * olarak gönderiliyordu. Ama Odoo'da hr.expense.product_id alanı
 * 'product.product' (varyant) modeline referans verir, 'product.template'e
 * DEĞİL — bu iki model farklı id sıralarına sahiptir. Çoğu basit/varyantsız
 * üründe id'ler tesadüfen örtüştüğü için fark edilmemiş, ama "Su" gibi
 * bazı kategorilerde template id'si (örn. 76) hiç var olmayan ya da
 * silinmiş bir product.product id'sine denk gelip "Record does not exist"
 * (XML-RPC fault) hatasına yol açıyordu. Artık doğrudan product.product
 * sorgulanıyor, dönen id zaten doğru modelin id'si oluyor.
 */
export async function getExpenseCategories() {
  return execute(
    'product.product',
    'search_read',
    [[['can_be_expensed', '=', true]]],
    { fields: ['id', 'name'], limit: 100 },
  );
}

/** Odoo'ya masraf kaydı oluştur */
export async function createExpense(data: {
  name: string; // açıklama
  product_id: number; // kategori (product.product id)
  total_amount: number; // tutar
  employee_id: number; // çalışan id
  payment_mode: string; // 'own_account' | 'company_account'
  description?: string; // ek not
  companyId?: number;
}) {
  // Güvenlik ağı (14.10.2026): eski kayıtlı tarayıcı state'i veya önbelleğe
  // alınmış kategori listesi yüzünden hâlâ bir product.template id'si
  // gelirse (product.product'ta bulunamazsa), aynı şablonun gerçek
  // product.product karşılığını bulup onu kullan — kullanıcıya ham
  // "Record does not exist" XML-RPC hatası yansımasın.
  const productId = await resolveGecerliProductId(data.product_id, data.companyId);

  const expenseId = await execute(
    'hr.expense',
    'create',
    [
      {
        name: data.name,
        product_id: productId,
        total_amount: data.total_amount,
        employee_id: data.employee_id,
        payment_mode: data.payment_mode,
        description: data.description ?? '',
      },
    ],
    {},
    data.companyId,
  );
  return expenseId;
}

async function resolveGecerliProductId(productId: number, companyId?: number): Promise<number> {
  const mevcut = (await execute(
    'product.product', 'search_read',
    [[['id', '=', productId]]],
    { fields: ['id'], limit: 1 },
    companyId,
  )) as { id: number }[];
  if (mevcut.length) return productId;

  // Verilen id bir product.product değilse, aynı id'li bir product.template
  // olabilir mi diye bak ve onun gerçek varyantını bul.
  const tmpl = (await execute(
    'product.template', 'read', [[productId]],
    { fields: ['id'], context: { active_test: false } },
    companyId,
  ).catch(() => [])) as { id: number }[];
  if (tmpl.length) {
    const varyant = (await execute(
      'product.product', 'search_read',
      [[['product_tmpl_id', '=', productId]]],
      { fields: ['id'], limit: 1, context: { active_test: false } },
      companyId,
    )) as { id: number }[];
    if (varyant.length) return varyant[0].id;
  }

  throw new Error(
    `Masraf kategorisi Odoo'da bulunamadı (id: ${productId}). Lütfen sayfayı yenileyip kategoriyi tekrar seçin.`,
  );
}

/** Odoo'daki çalışanları çek */
export async function getEmployees(companyId?: number) {
  return execute(
    'hr.employee',
    'search_read',
    [[]],
    { fields: ['id', 'name'], limit: 100 },
    companyId,
  );
}

export async function searchSuppliers(query: string) {
  return execute(
    'res.partner',
    'search_read',
    [[['name', 'ilike', query]]],
    { fields: ['id', 'name', 'phone', 'email'], limit: 10 },
  );
}
