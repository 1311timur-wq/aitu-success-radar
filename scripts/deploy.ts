/**
 * Cross-platform deploy (Windows cmd/PowerShell, macOS, Linux) to the project from .env.
 *   npm run deploy            -> Security Rules + indexes + Teacher Portal (hosting)
 *   npm run deploy -- rules   -> only Security Rules + indexes
 *   npm run deploy -- apps    -> build and deploy both apps (portal at /, My DU at /my-du/)
 * One-time before the first deploy: npx firebase login
 */
import { spawnSync } from 'node:child_process';
import { firebaseTarget, projectId } from './env.ts';

if (firebaseTarget.useEmulators) {
  console.error('FIREBASE_PROJECT_ID is not set in .env (or USE_EMULATORS=true): nothing to deploy to.');
  process.exit(1);
}

const what = process.argv[2] ?? 'all';
const run = (cmd: string, args: string[]) => {
  console.log(`> ${cmd} ${args.join(' ')}`);
  // Windows needs a shell to run npm/npx (.cmd shims); pass one command string so Node does not warn (DEP0190).
  const r = process.platform === 'win32'
    ? spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (what !== 'rules') run('npm', ['run', 'build']); // teacher first (cleans dist/hosting), then My DU into /my-du
const only = what === 'rules' ? 'firestore' : what === 'apps' ? 'hosting' : 'firestore,hosting';
run('npx', ['firebase', 'deploy', '--only', only, '--project', projectId]);
if (what !== 'rules') console.log(`\nTeacher Portal: https://${projectId}.web.app\nMy DU (students): https://${projectId}.web.app/my-du/`);
