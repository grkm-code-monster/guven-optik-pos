import 'dotenv/config';
import { createApp } from './app';
import { runSyncEngine } from './utils/syncEngine';

const port = Number(process.env.PORT) || 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

setInterval(runSyncEngine, 60000);
console.log('Sync engine started');
