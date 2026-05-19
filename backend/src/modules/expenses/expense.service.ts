import { execute } from '../odoo/odoo.service';

/** Odoo'dan masraf kategorilerini çek (can_be_expensed = true) */
export async function getExpenseCategories() {
  return execute(
    'product.template',
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
  const expenseId = await execute(
    'hr.expense',
    'create',
    [
      {
        name: data.name,
        product_id: data.product_id,
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
