import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function startProcess(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd: path.resolve(__dirname, cwd),
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  child.on('error', (err) => {
    console.error(`[${name}] Failed to start:`, err);
  });

  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`[${name}] exited with code ${code}`);
    }
  });

  return child;
}

console.log('🚀 Starting HackWave Dispatch Server and Client...');
const backend = startProcess('backend', 'npm', ['run', 'dev'], 'backend');
const frontend = startProcess('frontend', 'npm', ['run', 'dev'], 'frontend');

function shutdown() {
  console.log('\n🛑 Shutting down services...');
  backend.kill('SIGINT');
  frontend.kill('SIGINT');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
