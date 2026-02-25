import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import chalk from 'chalk';

const PKG_NAME = 'minara';
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const CACHE_DIR = join(homedir(), '.minara');
const CACHE_FILE = join(CACHE_DIR, 'update-check.json');
const FETCH_TIMEOUT_MS = 3000;

interface CacheData {
  latest: string;
  checkedAt: number;
}

function readCache(): CacheData | null {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) as CacheData;
  } catch {
    return null;
  }
}

function writeCache(data: CacheData): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(CACHE_FILE, JSON.stringify(data), { mode: 0o600 });
  } catch {
    // best-effort
  }
}

function isNewer(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] ?? 0) > (l[i] ?? 0)) return true;
    if ((r[i] ?? 0) < (l[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Non-blocking update check. Returns a formatted notice string if a newer
 * version is available on npm, or `null` if up-to-date / check skipped.
 */
export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  try {
    // Use cache to avoid hitting npm on every invocation
    const cached = readCache();
    if (cached && Date.now() - cached.checkedAt < CHECK_INTERVAL_MS) {
      return isNewer(cached.latest, currentVersion)
        ? formatNotice(currentVersion, cached.latest)
        : null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(`https://registry.npmjs.org/${PKG_NAME}/latest`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const { version: latest } = (await res.json()) as { version: string };
    if (!latest) return null;

    writeCache({ latest, checkedAt: Date.now() });

    return isNewer(latest, currentVersion)
      ? formatNotice(currentVersion, latest)
      : null;
  } catch {
    return null;
  }
}

function formatNotice(current: string, latest: string): string {
  const line = `  Update available: ${chalk.dim(current)} → ${chalk.green.bold(latest)}`;
  const cmd = `  Run ${chalk.cyan('npm i -g minara')} to update`;
  const border = chalk.yellow('─'.repeat(48));
  return `\n${border}\n${line}\n${cmd}\n${border}`;
}
