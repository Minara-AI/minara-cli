import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync,
  openSync, closeSync,
} from 'node:fs';
import { execSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';

const MINARA_DIR = join(homedir(), '.minara');
const MODELS_FILE = join(MINARA_DIR, 'models.json');
const SERVER_FILE = join(MINARA_DIR, 'vllm-server.json');
export const VLLM_LOG = join(MINARA_DIR, 'vllm.log');

export const VLLM_PORT = 8321;
export const VLLM_BASE_URL = `http://localhost:${VLLM_PORT}`;

// ─── Model registry ─────────────────────────────────────────────────────────

export interface ModelDef {
  id: string;
  name: string;
  hfRepo: string;
  params: string;
  recommended?: boolean;
}

export const AVAILABLE_MODELS: ModelDef[] = [
  {
    id: 'dmind-3-nano',
    name: 'DMind-3-nano',
    hfRepo: 'DMindAI/DMind-3-nano',
    params: '270M',
    recommended: true,
  },
  {
    id: 'dmind-3-mini',
    name: 'DMind-3-mini',
    hfRepo: 'DMindAI/DMind-3-mini',
    params: '4B',
  },
  {
    id: 'dmind-3',
    name: 'DMind-3',
    hfRepo: 'DMindAI/DMind-3',
    params: '21B',
  },
];

// ─── State persistence ──────────────────────────────────────────────────────

interface ModelsState {
  installed: string[];
  active?: string;
}

function ensureDir(): void {
  if (!existsSync(MINARA_DIR)) mkdirSync(MINARA_DIR, { recursive: true, mode: 0o700 });
}

function loadState(): ModelsState {
  if (!existsSync(MODELS_FILE)) return { installed: [] };
  try {
    return JSON.parse(readFileSync(MODELS_FILE, 'utf-8')) as ModelsState;
  } catch {
    return { installed: [] };
  }
}

function saveState(s: ModelsState): void {
  ensureDir();
  writeFileSync(MODELS_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

export function getInstalledIds(): string[] {
  return loadState().installed;
}

export function isInstalled(id: string): boolean {
  return loadState().installed.includes(id);
}

export function getActiveId(): string | undefined {
  const s = loadState();
  if (s.installed.length === 0) return undefined;
  return s.active && s.installed.includes(s.active) ? s.active : s.installed[0];
}

export function getModelDef(id: string): ModelDef | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

export function markInstalled(id: string): void {
  const s = loadState();
  if (!s.installed.includes(id)) s.installed.push(id);
  if (!s.active) s.active = id;
  saveState(s);
}

export function markUninstalled(id: string): void {
  const s = loadState();
  s.installed = s.installed.filter((m) => m !== id);
  if (s.active === id) s.active = s.installed[0];
  saveState(s);
}

export function setActiveModel(id: string): void {
  const s = loadState();
  if (s.installed.includes(id)) {
    s.active = id;
    saveState(s);
  }
}

// ─── Prerequisites ──────────────────────────────────────────────────────────

export function findPython(): string | null {
  for (const cmd of ['python3', 'python']) {
    try {
      const v = execSync(`${cmd} --version`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (v.includes('3.')) return cmd;
    } catch { /* skip */ }
  }
  return null;
}

export function hasVllm(py: string): boolean {
  try {
    execSync(`${py} -c "import vllm"`, { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

export function hasHfHub(py: string): boolean {
  try {
    execSync(`${py} -c "import huggingface_hub"`, { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

export function pipInstall(py: string, pkg: string): boolean {
  const r = spawnSync(py, ['-m', 'pip', 'install', pkg], { stdio: 'inherit' });
  return r.status === 0;
}

// ─── Model download / cache ─────────────────────────────────────────────────

export function downloadModel(py: string, hfRepo: string): boolean {
  const r = spawnSync(py, [
    '-c',
    `from huggingface_hub import snapshot_download; snapshot_download('${hfRepo}')`,
  ], { stdio: 'inherit' });
  return r.status === 0;
}

export function clearModelCache(py: string, hfRepo: string): boolean {
  try {
    execSync(`${py} -c "\
from huggingface_hub import scan_cache_dir;\
c=scan_cache_dir();\
h=[r.commit_hash for repo in c.repos if repo.repo_id=='${hfRepo}' for r in repo.revisions];\
c.delete_revisions(*h).execute() if h else None\
"`, { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

// ─── Server info ────────────────────────────────────────────────────────────

export interface ServerInfo {
  pid: number;
  modelId: string;
  hfRepo: string;
  startedAt: string;
}

export function getServerInfo(): ServerInfo | null {
  if (!existsSync(SERVER_FILE)) return null;
  try {
    return JSON.parse(readFileSync(SERVER_FILE, 'utf-8')) as ServerInfo;
  } catch {
    return null;
  }
}

function saveServerInfo(info: ServerInfo): void {
  ensureDir();
  writeFileSync(SERVER_FILE, JSON.stringify(info, null, 2), { mode: 0o600 });
}

function clearServerInfo(): void {
  try { unlinkSync(SERVER_FILE); } catch { /* ignore */ }
}

// ─── vLLM server lifecycle ──────────────────────────────────────────────────

export async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${VLLM_BASE_URL}/v1/models`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Start vLLM attached to current process (auto-stops when parent exits). */
export function startServerAttached(py: string, hfRepo: string): ChildProcess {
  return spawn(py, [
    '-m', 'vllm.entrypoints.openai.api_server',
    '--model', hfRepo,
    '--port', String(VLLM_PORT),
    '--host', '0.0.0.0',
    '--trust-remote-code',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
}

/** Start vLLM as a detached background process (survives CLI exit). */
export function startServerDetached(py: string, modelId: string, hfRepo: string): number | null {
  ensureDir();
  const out = openSync(VLLM_LOG, 'a');
  const err = openSync(VLLM_LOG, 'a');

  const child = spawn(py, [
    '-m', 'vllm.entrypoints.openai.api_server',
    '--model', hfRepo,
    '--port', String(VLLM_PORT),
    '--host', '0.0.0.0',
    '--trust-remote-code',
  ], {
    stdio: ['ignore', out, err],
    detached: true,
  });

  child.unref();
  closeSync(out);
  closeSync(err);

  if (child.pid) {
    saveServerInfo({ pid: child.pid, modelId, hfRepo, startedAt: new Date().toISOString() });
  }

  return child.pid ?? null;
}

/** Stop the background vLLM server. */
export function stopServer(): void {
  const info = getServerInfo();
  if (info) {
    try { process.kill(info.pid, 'SIGTERM'); } catch { /* already dead */ }
  }
  clearServerInfo();
}

export async function waitForServer(timeoutMs = 120_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerRunning()) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
