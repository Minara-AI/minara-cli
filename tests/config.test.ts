/**
 * Unit tests for src/config.ts
 *
 * Tests credential I/O, auth guard, and config management.
 * Uses a temp directory instead of the real ~/.minara/ so tests are safe.
 *
 * Key detail: config.ts stores MINARA_DIR as a top-level constant derived
 * from homedir(). We must reset the module registry before each test so
 * each import picks up the fresh tempDir from the mocked homedir().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

// ── Temp directory per test ───────────────────────────────────────────────

let tempDir: string;

// Mock homedir to point at our temp directory
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => tempDir,
  };
});

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'minara-test-'));
  // Reset all module caches so config.ts re-evaluates its top-level constants
  vi.resetModules();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// Helper: dynamically import config for each test (fresh module)
async function importConfig() {
  return import('../src/config.js');
}

describe('config module', () => {
  // ── saveCredentials / loadCredentials ────────────────────────────────

  describe('saveCredentials', () => {
    it('should create ~/.minara/ directory and write credentials', async () => {
      const { saveCredentials } = await importConfig();

      saveCredentials({
        accessToken: 'test-token-123',
        email: 'test@example.com',
        userId: 'user-1',
      });

      const credsFile = join(tempDir, '.minara', 'credentials.json');
      expect(existsSync(credsFile)).toBe(true);

      const raw = readFileSync(credsFile, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.accessToken).toBe('test-token-123');
      expect(parsed.email).toBe('test@example.com');
    });

    it('should overwrite previous credentials', async () => {
      const { saveCredentials, loadCredentials } = await importConfig();

      saveCredentials({ accessToken: 'old-token' });
      saveCredentials({ accessToken: 'new-token', email: 'new@test.com' });

      const loaded = loadCredentials();
      expect(loaded?.accessToken).toBe('new-token');
      expect(loaded?.email).toBe('new@test.com');
    });
  });

  describe('loadCredentials', () => {
    it('should return null when no credentials file exists', async () => {
      const { loadCredentials } = await importConfig();
      expect(loadCredentials()).toBeNull();
    });

    it('should return null when credentials file is corrupted', async () => {
      const { loadCredentials } = await importConfig();

      const dir = join(tempDir, '.minara');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'credentials.json'), 'NOT-VALID-JSON{{{', 'utf-8');

      expect(loadCredentials()).toBeNull();
    });

    it('should load valid credentials', async () => {
      const { saveCredentials, loadCredentials } = await importConfig();

      saveCredentials({ accessToken: 'abc', userId: 'u1', displayName: 'Alice' });
      const creds = loadCredentials();

      expect(creds).not.toBeNull();
      expect(creds!.accessToken).toBe('abc');
      expect(creds!.displayName).toBe('Alice');
    });
  });

  // ── clearCredentials ────────────────────────────────────────────────

  describe('clearCredentials', () => {
    it('should clear credentials file content', async () => {
      const { saveCredentials, clearCredentials, loadCredentials } = await importConfig();

      saveCredentials({ accessToken: 'to-be-cleared' });
      clearCredentials();

      // File exists but is empty → loadCredentials returns null (empty string → JSON parse fails)
      expect(loadCredentials()).toBeNull();
    });

    it('should not throw when credentials file does not exist', async () => {
      const { clearCredentials } = await importConfig();
      expect(() => clearCredentials()).not.toThrow();
    });
  });

  // ── requireAuth ─────────────────────────────────────────────────────

  describe('requireAuth', () => {
    it('should return credentials when valid token exists', async () => {
      const { saveCredentials, requireAuth } = await importConfig();

      saveCredentials({ accessToken: 'valid-token', email: 'user@test.com' });
      const creds = requireAuth();

      expect(creds.accessToken).toBe('valid-token');
    });

    it('should call process.exit(1) when no credentials exist', async () => {
      const { requireAuth } = await importConfig();

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as never);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => requireAuth()).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('not logged in'),
      );

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should call process.exit(1) when credentials have empty token', async () => {
      const { saveCredentials, requireAuth } = await importConfig();

      saveCredentials({ accessToken: '' });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as never);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => requireAuth()).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });
  });

  // ── loadConfig / saveConfig ────────────────────────────────────────

  describe('loadConfig', () => {
    it('should return default config when no config file exists', async () => {
      const { loadConfig } = await importConfig();

      const cfg = loadConfig();
      expect(cfg.baseUrl).toBe('https://api.minara.ai');
    });

    it('should merge saved config with defaults', async () => {
      const { saveConfig, loadConfig } = await importConfig();

      saveConfig({ baseUrl: 'https://custom.api.com' });
      const cfg = loadConfig();

      expect(cfg.baseUrl).toBe('https://custom.api.com');
    });
  });

  describe('getMinaraDir', () => {
    it('should create and return the minara directory path', async () => {
      const { getMinaraDir } = await importConfig();

      const dir = getMinaraDir();
      expect(dir).toBe(join(tempDir, '.minara'));
      expect(existsSync(dir)).toBe(true);
    });
  });
});
