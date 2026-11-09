import { isTest } from '../lib/env';
import { deleteExpiredSandboxes } from '../modules/demo/demo.service';

const EVERY_HOUR_MS = 60 * 60 * 1000;

async function cleanupDemoSandboxes() {
  try {
    const deleted = await deleteExpiredSandboxes();
    if (deleted && !isTest) console.log(`Deleted ${deleted} expired demo sandbox(es)`);
  } catch (err) {
    console.error('Demo sandbox cleanup failed:', err);
  }
}

/** Runs once at boot, then hourly. The timer is unref'd so it never keeps the process alive. */
export function scheduleDemoCleanup() {
  void cleanupDemoSandboxes();
  setInterval(cleanupDemoSandboxes, EVERY_HOUR_MS).unref();
}
