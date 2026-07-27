/**
 * Deploy service dry-run — shell komutu calistirmadan 409 ve pipeline testi.
 * Calistirma: cd backend && DEPLOY_DRY_RUN=1 npx tsx scripts/test-deploy-dry-run.ts
 */
import 'dotenv/config';
import {
  getDeployStepDefinitions,
  isDeployInProgress,
  readDeployStatus,
  tryStartDeploy,
} from '../src/modules/admin/deploy.service';

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  process.env.DEPLOY_DRY_RUN = '1';

  console.log('=== Sabit deploy komutlari ===');
  for (const s of getDeployStepDefinitions()) {
    console.log(`  [${s.id}] ${s.command}`);
  }

  const r1 = tryStartDeploy();
  if (!r1.ok) throw new Error('Ilk deploy baslatilamadi');
  console.log('\nIlk deploy: started');

  const r2 = tryStartDeploy();
  if (r2.ok) throw new Error('Esan deploy reddedilmedi');
  if (r2.reason !== 'already_running') throw new Error('Beklenen already_running');
  console.log('Esan deploy (senkron): reddedildi (already_running)');

  while (isDeployInProgress()) {
    await sleep(50);
  }

  const st = readDeployStatus();
  if (st.status !== 'success') {
    throw new Error(`Beklenen success, gelen ${st.status}`);
  }
  console.log('Pipeline dry-run: success');

  console.log('\nTum kontroller gecti.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
