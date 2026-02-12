import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Credentials } from './types.js';

const MINARA_DIR = join(homedir(), '.minara');
const CREDENTIALS_FILE = join(MINARA_DIR, 'credentials.json');
const CONFIG_FILE = join(MINARA_DIR, 'config.json');

// ─── Directory ───────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(MINARA_DIR)) {
    mkdirSync(MINARA_DIR, { recursive: true });
    chmodSync(MINARA_DIR, 0o700);
  }
}

// ─── Credentials ─────────────────────────────────────────────────────────────

export function saveCredentials(creds: Credentials): void {
  ensureDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), 'utf-8');
  chmodSync(CREDENTIALS_FILE, 0o600);
}

export function loadCredentials(): Credentials | null {
  if (!existsSync(CREDENTIALS_FILE)) return null;
  try {
    const raw = readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  if (existsSync(CREDENTIALS_FILE)) {
    writeFileSync(CREDENTIALS_FILE, '', 'utf-8');
  }
}

export function requireAuth(): Credentials {
  const creds = loadCredentials();
  if (!creds || !creds.accessToken) {
    console.error('You are not logged in. Run `minara login` first.');
    process.exit(1);
  }
  return creds;
}

// ─── Config (optional overrides) ────────────────────────────────────────────

export interface AppConfig {
  baseUrl: string;
}

const DEFAULT_CONFIG: AppConfig = {
  baseUrl: 'https://api.minara.ai',
};

export function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Partial<AppConfig>): void {
  ensureDir();
  const current = loadConfig();
  const merged = { ...current, ...config };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
}

export function getMinaraDir(): string {
  ensureDir();
  return MINARA_DIR;
}
