import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export type DeployStatusValue = 'idle' | 'running' | 'success' | 'failed';

export type DeployStatus = {
  status: DeployStatusValue;
  startedAt: string | null;
  finishedAt: string | null;
  currentStep: string | null;
  failedStep: string | null;
  error: string | null;
};

/** Sabit deploy adımları — kullanıcı girdisi ASLA enjekte edilmez */
const DEPLOY_STEPS: { id: string; label: string; cwd: string; cmd: string; args: string[] }[] = [
  { id: 'git-pull', label: 'git pull', cwd: '.', cmd: 'git', args: ['pull'] },
  { id: 'npm-backend', label: 'npm install (backend)', cwd: 'backend', cmd: 'npm', args: ['install'] },
  { id: 'npm-web', label: 'npm install (web)', cwd: 'packages/web', cmd: 'npm', args: ['install'] },
  {
    id: 'prisma-migrate',
    label: 'prisma migrate deploy',
    cwd: 'backend',
    cmd: 'npx',
    args: ['prisma', 'migrate', 'deploy'],
  },
  { id: 'build-backend', label: 'npm run build (backend)', cwd: 'backend', cmd: 'npm', args: ['run', 'build'] },
  { id: 'build-web', label: 'npm run build (web)', cwd: 'packages/web', cmd: 'npm', args: ['run', 'build'] },
  {
    id: 'pm2-restart',
    label: 'pm2 restart guven-backend guven-frontend',
    cwd: '.',
    cmd: 'pm2',
    args: ['restart', 'guven-backend', 'guven-frontend'],
  },
];

let isDeploying = false;

function repoRoot(): string {
  return path.resolve(__dirname, '../../../..');
}

function logsDir(): string {
  const dir = path.join(repoRoot(), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logFilePath(): string {
  return path.join(logsDir(), 'deploy.log');
}

function statusFilePath(): string {
  return path.join(logsDir(), 'deploy-status.json');
}

function defaultStatus(): DeployStatus {
  return {
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    currentStep: null,
    failedStep: null,
    error: null,
  };
}

export function readDeployStatus(): DeployStatus {
  try {
    const raw = fs.readFileSync(statusFilePath(), 'utf8');
    return { ...defaultStatus(), ...JSON.parse(raw) } as DeployStatus;
  } catch {
    return defaultStatus();
  }
}

function writeDeployStatus(partial: Partial<DeployStatus>): DeployStatus {
  const next = { ...readDeployStatus(), ...partial };
  fs.writeFileSync(statusFilePath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function appendLog(line: string): void {
  fs.appendFileSync(logFilePath(), line, 'utf8');
}

function isDryRun(): boolean {
  return process.env.DEPLOY_DRY_RUN === '1' || process.env.DEPLOY_DRY_RUN === 'true';
}

function runCommand(
  stepLabel: string,
  cwd: string,
  cmd: string,
  args: string[],
  options?: { detached?: boolean },
): Promise<void> {
  if (isDryRun()) {
    appendLog(`[DRY RUN] ${stepLabel}\n`);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    appendLog(`\n=== ${stepLabel} ===\n`);
    appendLog(`$ ${cmd} ${args.join(' ')}\n`);
    appendLog(`cwd: ${cwd}\n`);

    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      shell: false,
      detached: options?.detached ?? false,
      stdio: options?.detached ? 'ignore' : 'pipe',
    });

    if (options?.detached) {
      child.unref();
      resolve();
      return;
    }

    child.stdout?.on('data', (chunk: Buffer) => appendLog(chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => appendLog(chunk.toString()));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${stepLabel} başarısız (çıkış kodu ${code ?? '?'})`));
    });
  });
}

async function executeDeployPipeline(): Promise<void> {
  const root = repoRoot();
  const startedAt = new Date().toISOString();
  appendLog(`\n\n========== Deploy başladı: ${startedAt} ==========\n`);
  writeDeployStatus({
    status: 'running',
    startedAt,
    finishedAt: null,
    currentStep: null,
    failedStep: null,
    error: null,
  });

  try {
    for (let i = 0; i < DEPLOY_STEPS.length; i++) {
      const step = DEPLOY_STEPS[i];
      writeDeployStatus({ currentStep: step.label });

      const stepCwd = path.join(root, step.cwd);
      const isLast = i === DEPLOY_STEPS.length - 1;

      if (isLast) {
        await runCommand(step.label, stepCwd, step.cmd, step.args, { detached: true });
      } else {
        await runCommand(step.label, stepCwd, step.cmd, step.args);
      }
    }

    writeDeployStatus({
      status: 'success',
      finishedAt: new Date().toISOString(),
      currentStep: null,
      failedStep: null,
      error: null,
    });
    appendLog(`\n========== Deploy tamamlandı ==========\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const current = readDeployStatus();
    writeDeployStatus({
      status: 'failed',
      finishedAt: new Date().toISOString(),
      failedStep: current.currentStep,
      error: message,
    });
    appendLog(`\n========== Deploy HATA: ${message} ==========\n`);
  } finally {
    isDeploying = false;
  }
}

export function getDeployLogTail(maxChars = 12000): string {
  try {
    const full = fs.readFileSync(logFilePath(), 'utf8');
    if (full.length <= maxChars) return full;
    return '…\n' + full.slice(-maxChars);
  } catch {
    return '';
  }
}

export function isDeployInProgress(): boolean {
  return isDeploying || readDeployStatus().status === 'running';
}

export function tryStartDeploy(): { ok: true } | { ok: false; reason: 'already_running' } {
  if (isDeployInProgress()) {
    return { ok: false, reason: 'already_running' };
  }
  isDeploying = true;
  setImmediate(() => {
    void executeDeployPipeline();
  });
  return { ok: true };
}

export function getDeployStepDefinitions(): { id: string; label: string; command: string }[] {
  return DEPLOY_STEPS.map((s) => ({
    id: s.id,
    label: s.label,
    command: `${s.cmd} ${s.args.join(' ')}`,
  }));
}
