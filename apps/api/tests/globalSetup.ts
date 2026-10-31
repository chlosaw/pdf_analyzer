import { execSync } from 'node:child_process';
import { applyTestEnv } from './testEnv';

export default function setup() {
  applyTestEnv();
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: process.env });
}
