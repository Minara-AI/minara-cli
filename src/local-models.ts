import { join } from 'node:path';
import { homedir, platform, arch } from 'node:os';
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync,
  openSync, closeSync,
} from 'node:fs';
import { execSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';

const MINARA_DIR = join(homedir(), '.minara');
const MODELS_FILE = join(MINARA_DIR, 'models.json');
const SERVER_FILE = join(MINARA_DIR, 'vllm-server.json');
const MODEL_UPDATE_CACHE_FILE = join(MINARA_DIR, 'model-update-check.json');
export const VLLM_LOG = join(MINARA_DIR, 'vllm.log');

export const VLLM_PORT = 8321;
export const VLLM_BASE_URL = `http://localhost:${VLLM_PORT}`;

// ─── Model registry ─────────────────────────────────────────────────────────

export interface ModelDef {
  id: string;
  name: string;
  hfRepo: string;
  params: string;
  /** Subdirectory inside the repo where config.json / model weights live */
  subdir?: string;
  recommended?: boolean;
}

export const AVAILABLE_MODELS: ModelDef[] = [
  {
    id: 'dmind-3-nano',
    name: 'DMind-3-nano',
    hfRepo: 'DMindAI/DMind-3-nano',
    params: '270M',
    subdir: 'model',
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

export interface ModelUpdateInfo {
  modelId: string;
  modelName: string;
  hfRepo: string;
  localRevision?: string;
  remoteRevision?: string;
  hasUpdate: boolean;
  error?: string;
}

interface ModelUpdateCacheEntry {
  checkedAt: number;
  localRevision?: string;
  remoteRevision?: string;
  hasUpdate: boolean;
  error?: string;
}

interface ModelUpdateCache {
  byModelId: Record<string, ModelUpdateCacheEntry>;
}

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

// ─── Architecture ───────────────────────────────────────────────────────────

export function isAppleSilicon(): boolean {
  return platform() === 'darwin' && arch() === 'arm64';
}

export function getArchLabel(): string {
  const a = arch();
  const p = platform();
  if (p === 'darwin') return a === 'arm64' ? 'Apple Silicon (arm64)' : `macOS (${a})`;
  if (p === 'linux') return `Linux (${a})`;
  return `${p} (${a})`;
}

/** Map Python module directory names to pip package names for common cases */
const MOD_TO_PIP: Record<string, string> = {
  charset_normalizer: 'charset-normalizer',
  PIL: 'pillow',
  cv2: 'opencv-python-headless',
  yaml: 'pyyaml',
  zmq: 'pyzmq',
  _cffi_backend: 'cffi',
  grpc: 'grpcio',
  sklearn: 'scikit-learn',
  skimage: 'scikit-image',
};

/**
 * On arm64 macOS, pre-existing x86_64 native extensions cause ImportError.
 * Iteratively try to import `targetModule`, detect which dependency has
 * an arch-mismatched or broken .so file, fix it, and retry — until the
 * import succeeds or no more fixable errors are found.
 * Only fixes packages actually needed by the target, not the entire env.
 */
export function fixArchForImport(py: string, targetModule: string): string[] {
  if (!isAppleSilicon()) return [];

  const fixed: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < 30; i++) {
    try {
      execSync(`${py} -c "import ${targetModule}"`, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });
      break;
    } catch (err: unknown) {
      const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? '';
      const isArchError =
        stderr.includes('incompatible architecture') ||
        stderr.includes('x86_64') ||
        stderr.includes('has not been built correctly');

      if (!isArchError) break;

      // Extract the module directory from the .so path or import traceback
      const soMatch =
        stderr.match(/site-packages\/([^/]+)\//) ||
        stderr.match(/that ([\w-]+) has not been built/);
      if (!soMatch) break;

      const modDir = soMatch[1];
      if (seen.has(modDir)) break;
      seen.add(modDir);

      const pipName = MOD_TO_PIP[modDir] ?? modDir.replace(/_/g, '-');
      const r = spawnSync(py, ['-m', 'pip', 'install', '--force-reinstall', '--no-cache-dir', pipName], {
        stdio: 'inherit',
      });
      if (r.status === 0) fixed.push(pipName);
      else break;
    }
  }
  return fixed;
}

/**
 * Fix native deps for all modules required by the local model stack.
 */
export function fixNativeDeps(py: string): string[] {
  if (!isAppleSilicon()) return [];
  const all: string[] = [];
  for (const mod of ['vllm', 'huggingface_hub']) {
    all.push(...fixArchForImport(py, mod));
  }
  return all;
}

// ─── Model download / cache ─────────────────────────────────────────────────

export function downloadModel(py: string, hfRepo: string): boolean {
  const r = spawnSync(py, [
    '-c',
    `from huggingface_hub import snapshot_download; snapshot_download('${hfRepo}')`,
  ], { stdio: 'inherit' });
  return r.status === 0;
}

/**
 * Resolve the local filesystem path for a downloaded model.
 * For repos with a `subdir`, returns the path to that subdirectory.
 */
export function resolveModelPath(py: string, model: ModelDef): string | null {
  const suffix = model.subdir ? `, '${model.subdir}'` : '';
  const script = `from huggingface_hub import snapshot_download; import os; p=snapshot_download('${model.hfRepo}'); print(os.path.join(p${suffix}))`;
  try {
    return execSync(`${py} -c "${script}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    }).trim();
  } catch {
    return null;
  }
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

function loadModelUpdateCache(): ModelUpdateCache {
  if (!existsSync(MODEL_UPDATE_CACHE_FILE)) return { byModelId: {} };
  try {
    return JSON.parse(readFileSync(MODEL_UPDATE_CACHE_FILE, 'utf-8')) as ModelUpdateCache;
  } catch {
    return { byModelId: {} };
  }
}

function saveModelUpdateCache(cache: ModelUpdateCache): void {
  ensureDir();
  writeFileSync(MODEL_UPDATE_CACHE_FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
}

function getLocalCachedRevision(py: string, hfRepo: string): string | null {
  const script = `
import sys
from huggingface_hub import scan_cache_dir

repo_id = sys.argv[1]
cache = scan_cache_dir()
repos = [r for r in cache.repos if r.repo_id == repo_id]
if not repos:
    print("")
    raise SystemExit(0)

revisions = []
for repo in repos:
    revisions.extend(repo.revisions)

if not revisions:
    print("")
    raise SystemExit(0)

revisions.sort(key=lambda r: r.last_modified or 0, reverse=True)
print(revisions[0].commit_hash or "")
`.trim();

  const r = spawnSync(py, ['-c', script, hfRepo], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (r.status !== 0) return null;
  const out = (r.stdout ?? '').trim();
  return out || null;
}

async function getRemoteLatestRevision(hfRepo: string): Promise<string | null> {
  const safeRepo = hfRepo.split('/').map((s) => encodeURIComponent(s)).join('/');
  try {
    const res = await fetch(`https://huggingface.co/api/models/${safeRepo}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sha?: unknown };
    return typeof data.sha === 'string' && data.sha ? data.sha : null;
  } catch {
    return null;
  }
}

/**
 * Check one installed model for updates.
 * Uses a local cache to avoid frequent Hugging Face API calls.
 */
export async function checkModelUpdate(
  py: string,
  modelId: string,
  maxAgeMs = 4 * 60 * 60 * 1000,
): Promise<ModelUpdateInfo | null> {
  const model = getModelDef(modelId);
  if (!model) return null;

  const localRevision = getLocalCachedRevision(py, model.hfRepo) ?? undefined;
  const cache = loadModelUpdateCache();
  const cached = cache.byModelId[model.id];

  if (
    cached &&
    Date.now() - cached.checkedAt < maxAgeMs &&
    cached.localRevision === localRevision
  ) {
    return {
      modelId: model.id,
      modelName: model.name,
      hfRepo: model.hfRepo,
      localRevision,
      remoteRevision: cached.remoteRevision,
      hasUpdate: cached.hasUpdate,
      error: cached.error,
    };
  }

  const remoteRevision = await getRemoteLatestRevision(model.hfRepo) ?? undefined;

  let result: ModelUpdateInfo;
  if (!remoteRevision) {
    result = {
      modelId: model.id,
      modelName: model.name,
      hfRepo: model.hfRepo,
      localRevision,
      hasUpdate: false,
      error: 'Could not fetch latest remote revision',
    };
  } else if (!localRevision) {
    result = {
      modelId: model.id,
      modelName: model.name,
      hfRepo: model.hfRepo,
      remoteRevision,
      hasUpdate: false,
      error: 'No local cached revision found',
    };
  } else {
    result = {
      modelId: model.id,
      modelName: model.name,
      hfRepo: model.hfRepo,
      localRevision,
      remoteRevision,
      hasUpdate: localRevision !== remoteRevision,
    };
  }

  cache.byModelId[model.id] = {
    checkedAt: Date.now(),
    localRevision: result.localRevision,
    remoteRevision: result.remoteRevision,
    hasUpdate: result.hasUpdate,
    error: result.error,
  };
  saveModelUpdateCache(cache);

  return result;
}

/**
 * Compare locally cached Hugging Face model revisions with remote latest sha.
 * Returns one entry per installed model.
 */
export async function checkInstalledModelUpdates(py: string): Promise<ModelUpdateInfo[]> {
  const installedIds = getInstalledIds();
  const models = installedIds
    .map((id) => getModelDef(id))
    .filter((m): m is ModelDef => Boolean(m));

  const checks = models.map(async (model): Promise<ModelUpdateInfo> => {
    const info = await checkModelUpdate(py, model.id, 0);
    return info ?? {
      modelId: model.id,
      modelName: model.name,
      hfRepo: model.hfRepo,
      hasUpdate: false,
      error: 'Model not found',
    };
  });

  return Promise.all(checks);
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
export function startServerAttached(py: string, modelPath: string): ChildProcess {
  return spawn(py, [
    '-m', 'vllm.entrypoints.openai.api_server',
    '--model', modelPath,
    '--port', String(VLLM_PORT),
    '--host', '0.0.0.0',
    '--trust-remote-code',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
}

/** Start vLLM as a detached background process (survives CLI exit). */
export function startServerDetached(py: string, modelId: string, modelPath: string): number | null {
  ensureDir();
  const out = openSync(VLLM_LOG, 'a');
  const err = openSync(VLLM_LOG, 'a');

  const child = spawn(py, [
    '-m', 'vllm.entrypoints.openai.api_server',
    '--model', modelPath,
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
    saveServerInfo({ pid: child.pid, modelId, hfRepo: modelPath, startedAt: new Date().toISOString() });
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
