/**
 * 05.11.2026 — SADECE OKUR. `prisma migrate deploy` öncesi güvenlik kontrolü:
 * veritabanında uygulanmamış migration olarak SADECE beklenen(ler) kalmış mı?
 * Başka (eski, elle uygulanmış vb.) bekleyen migration varsa DURUR (exit 1) — böylece
 * deploy zinciri hiçbir şeyi değiştirmeden kesilir.
 *
 * Kullanım: npx ts-node --transpile-only scripts/migration-kontrol.ts 20261105120000_kasa_tahsilat_ciro_duzeltme
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/database/prisma';

async function main() {
  const beklenen = new Set(process.argv.slice(2));
  const dir = path.join(__dirname, '..', 'prisma', 'migrations');
  const klasorler = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort();
  const uygulanan = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
    SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
  const tamam = new Set(uygulanan.filter((m) => m.finished_at && !m.rolled_back_at).map((m) => m.migration_name));
  const yarim = uygulanan.filter((m) => !m.finished_at && !m.rolled_back_at).map((m) => m.migration_name);
  const bekleyen = klasorler.filter((k) => !tamam.has(k));
  console.log(`Migration: ${klasorler.length} klasör, ${tamam.size} uygulanmış.`);
  console.log(`Bekleyen: ${bekleyen.length ? bekleyen.join(', ') : '(yok)'}`);
  if (yarim.length) {
    console.log(`⚠️ DURDU: yarım kalmış migration var: ${yarim.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const beklenmeyen = bekleyen.filter((b) => !beklenen.has(b));
  if (beklenmeyen.length) {
    console.log(`⚠️ DURDU: beklenmeyen bekleyen migration: ${beklenmeyen.join(', ')} — hiçbir şey değiştirilmedi.`);
    process.exitCode = 1;
    return;
  }
  console.log('✓ Migration kontrolü tamam.');
}
main()
  .catch((e) => {
    console.error('⚠️ DURDU (migration kontrolü yapılamadı):', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
