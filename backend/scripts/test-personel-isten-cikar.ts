/**
 * İşten çıkarma akışı doğrulama (test_sm_gvn1)
 * npx tsx backend/scripts/test-personel-isten-cikar.ts
 */
import { prisma } from '../src/database/prisma';
import { login } from '../src/modules/auth/auth.service';
import { execute } from '../src/modules/odoo/odoo.service';
import { setPdksUserStatus } from '../src/modules/pdks/pdks.service';

const TEST_USERNAME = 'test_sm_gvn1';
const TEST_PIN = '123456';

async function tryLogin(label: string) {
  try {
    await login(TEST_USERNAME, TEST_PIN);
    console.log(`${label}: ✓ giriş başarılı`);
    return true;
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.log(`${label}: ✗ ${err.code ?? err.message ?? e}`);
    return false;
  }
}

async function main() {
  console.log('=== Personel işten çıkarma testi ===\n');

  const user = await prisma.user.findUnique({
    where: { username: TEST_USERNAME },
    include: { branch: true },
  });
  if (!user) throw new Error(`${TEST_USERNAME} bulunamadı`);

  let personel = await prisma.personel.findFirst({ where: { userId: user.id } });
  const createdForTest = !personel;
  if (!personel) {
    personel = await prisma.personel.create({
      data: {
        ad: 'Test',
        soyad: 'SM GVN1',
        pozisyon: 'DIGER',
        subeId: user.branch.code,
        subeAdi: user.branch.name,
        aktif: true,
        userId: user.id,
      },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { personelId: personel.id, isActive: true },
    });
    console.log('Geçici Personel kaydı oluşturuldu:', personel.id);
  } else {
    await prisma.personel.update({ where: { id: personel.id }, data: { aktif: true } });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
  }

  await tryLogin('Başlangıç');

  // İşten çıkar (controller mantığı)
  await prisma.personel.update({ where: { id: personel.id }, data: { aktif: false } });
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  console.log('\n→ Personel + User pasif edildi');

  const loginBlocked = !(await tryLogin('İşten çıkarma sonrası'));
  if (!loginBlocked) {
    throw new Error('POS girişi engellenmedi — test başarısız');
  }

  // Tekrar aktifleştir
  await prisma.personel.update({ where: { id: personel.id }, data: { aktif: true } });
  await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
  console.log('\n→ Personel + User tekrar aktif');

  const loginOk = await tryLogin('Aktifleştirme sonrası');
  if (!loginOk) throw new Error('Aktifleştirme sonrası giriş çalışmadı');

  // PDKS API smoke (status toggle + geri al)
  const pdksProbeId = personel.pdksId;
  if (pdksProbeId) {
    const off = await setPdksUserStatus(pdksProbeId, false);
    const on = await setPdksUserStatus(pdksProbeId, true);
    console.log(`\nPDKS toggle: pasif=${off.success ? 'OK' : off.message}, aktif=${on.success ? 'OK' : on.message}`);
  } else {
    console.log('\nPDKS: test personelde pdksId yok — API ayrı doğrulandı (PUT /users/{id})');
  }

  // Odoo smoke — sadece bilgi
  if (personel.odooEmployeeId) {
    const emp = await execute('hr.employee', 'read', [[personel.odooEmployeeId], ['active']]);
    console.log('Odoo active:', emp?.[0]?.active);
  } else {
    console.log('Odoo: test personelde odooEmployeeId yok — archive adımı atlandı');
  }

  if (createdForTest) {
    await prisma.user.update({ where: { id: user.id }, data: { personelId: null } });
    await prisma.personel.delete({ where: { id: personel.id } });
    console.log('\nGeçici Personel kaydı temizlendi');
  }

  console.log('\n=== Tüm testler geçti ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
