/**
 * Test scriptleri — varsayılan dry-run, --execute ile gerçek yazma.
 */
export function parseTestScriptArgs() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const liveReadId = (() => {
    const arg = args.find((a) => a.startsWith('--live-read-id='));
    if (!arg) return undefined;
    const n = Number(arg.split('=')[1]);
    return n > 0 ? n : undefined;
  })();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Test script bayrakları:
  (varsayılan)     Sadece okuma / önizleme — Odoo'ya YAZMAZ
  --execute        Gerçek yazma testlerini çalıştır (disposable fixture üzerinde)
  --live-read-id=N Canlı ürün #N üzerinde SADECE okuma testi (export satır sayısı vb.)
`);
    process.exit(0);
  }

  return { execute, liveReadId };
}

export function requireExecute(execute: boolean, testName: string): boolean {
  if (execute) return true;
  console.log(`  ⏭️ ${testName} atlandı (dry-run — gerçek yazma için --execute)`);
  return false;
}
