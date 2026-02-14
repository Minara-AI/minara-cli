// ═══════════════════════════════════════════════════════════════════════════
//  Touch ID (macOS) — biometric verification for sensitive operations
// ═══════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync, chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import chalk from 'chalk';
import { loadConfig, getMinaraDir } from './config.js';

// Bump this when SWIFT_SOURCE changes to force recompilation
const TOUCHID_BINARY_VERSION = '1';

const SWIFT_SOURCE = `
import Foundation
import LocalAuthentication

// Mode: "check" = just check availability, "auth" = perform authentication
let mode = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "auth"
let context = LAContext()
var error: NSError?

guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
    let msg = error?.localizedDescription ?? "Touch ID not available"
    fputs("unavailable:\\(msg)\\n", stderr)
    exit(2)
}

if mode == "check" {
    print("available")
    exit(0)
}

// Auth mode — prompt for Touch ID
let reason = CommandLine.arguments.count > 2
    ? CommandLine.arguments[2]
    : "Minara CLI: Authorize transaction"

let semaphore = DispatchSemaphore(value: 0)
var authSuccess = false

context.evaluatePolicy(
    .deviceOwnerAuthenticationWithBiometrics,
    localizedReason: reason
) { result, authError in
    authSuccess = result
    if !result {
        let msg = authError?.localizedDescription ?? "Authentication failed"
        fputs("failed:\\(msg)\\n", stderr)
    }
    semaphore.signal()
}

semaphore.wait()
exit(authSuccess ? 0 : 1)
`;

// ─── Binary management ───────────────────────────────────────────────────

const BINARY_NAME = 'touchid_auth';
const VERSION_FILE = 'touchid_auth.version';

function getBinaryPath(): string {
  return join(getMinaraDir(), BINARY_NAME);
}

function getVersionPath(): string {
  return join(getMinaraDir(), VERSION_FILE);
}

function isBinaryUpToDate(): boolean {
  const binaryPath = getBinaryPath();
  const versionPath = getVersionPath();
  if (!existsSync(binaryPath) || !existsSync(versionPath)) return false;
  try {
    const ver = readFileSync(versionPath, 'utf-8').trim();
    return ver === TOUCHID_BINARY_VERSION;
  } catch {
    return false;
  }
}

/**
 * Compile the Touch ID Swift helper binary (cached in ~/.minara/).
 * Returns the path to the compiled binary.
 */
function ensureBinary(): string {
  const binaryPath = getBinaryPath();

  if (isBinaryUpToDate()) return binaryPath;

  const dir = getMinaraDir();
  const sourcePath = join(dir, 'touchid_auth.swift');

  writeFileSync(sourcePath, SWIFT_SOURCE, 'utf-8');

  try {
    execFileSync('/usr/bin/swiftc', [
      '-O',                          // optimized build
      '-o', binaryPath,
      sourcePath,
    ], {
      timeout: 120_000,              // 2 min timeout for first compile
      stdio: 'pipe',
    });
    chmodSync(binaryPath, 0o700);
    writeFileSync(getVersionPath(), TOUCHID_BINARY_VERSION, 'utf-8');
  } catch (err: unknown) {
    // Clean up on failure
    if (existsSync(binaryPath)) unlinkSync(binaryPath);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to compile Touch ID helper: ${msg}`);
  } finally {
    if (existsSync(sourcePath)) unlinkSync(sourcePath);
  }

  return binaryPath;
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Check whether Touch ID hardware is available on this machine.
 * Returns `false` on non-macOS or when hardware is absent / not enrolled.
 */
export function isTouchIdAvailable(): boolean {
  if (platform() !== 'darwin') return false;
  try {
    const binary = ensureBinary();
    execFileSync(binary, ['check'], { timeout: 10_000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Perform a Touch ID verification.
 * Resolves on success, throws on failure or cancellation.
 */
export function verifyTouchId(reason?: string): void {
  const binary = ensureBinary();
  const args = ['auth'];
  if (reason) args.push(reason);

  execFileSync(binary, args, { timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'] });
}

/**
 * If Touch ID is enabled in config, prompt the user for biometric
 * verification. Exits the process on failure.
 *
 * Call this before any sensitive financial operation.
 * On non-macOS platforms a warning is shown and execution continues.
 */
export async function requireTouchId(): Promise<void> {
  const config = loadConfig();
  if (!config.touchId) return;              // Touch ID not enabled — no-op

  if (platform() !== 'darwin') {
    console.log(chalk.yellow('⚠'), 'Touch ID is only available on macOS. Skipping biometric check.');
    return;
  }

  console.log('');
  console.log(chalk.blue('🔐'), chalk.bold('Touch ID verification required'));

  try {
    verifyTouchId();
    console.log(chalk.green('✔'), 'Touch ID verified');
    console.log('');
  } catch (err: unknown) {
    // Parse stderr for details
    const stderr = (err && typeof err === 'object' && 'stderr' in err)
      ? (err as { stderr: Buffer }).stderr?.toString().trim()
      : '';

    if (stderr.startsWith('unavailable:')) {
      console.error(chalk.red('✖'), 'Touch ID is not available on this device.');
      console.error(chalk.dim('  Tip: Run `minara config` to disable Touch ID protection.'));
    } else {
      console.error(chalk.red('✖'), 'Touch ID verification failed. Operation cancelled.');
      if (stderr) {
        const detail = stderr.startsWith('failed:') ? stderr.slice(7) : stderr;
        console.error(chalk.dim(`  ${detail}`));
      }
    }
    process.exit(1);
  }
}
