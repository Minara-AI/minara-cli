/**
 * Temporary local HTTP server for OAuth callback.
 *
 * Flow:
 *   1. CLI starts a local server on a random port
 *   2. CLI opens the browser to the OAuth URL (redirect_uri → localhost)
 *   3. User authenticates in the browser
 *   4. OAuth provider → Minara backend → redirects to our local server
 *   5. Local server captures token from query params
 *   6. Returns result and shuts down
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';

// ── Types ─────────────────────────────────────────────────────────────────

export interface OAuthCallbackResult {
  /** The access token (if login succeeded) */
  accessToken?: string;
  userId?: string;
  email?: string;
  displayName?: string;
  /** Error message (if login failed) */
  error?: string;
  /** Raw query parameters from the callback URL */
  rawParams: Record<string, string>;
}

export interface OAuthServer {
  /** Port the server is listening on */
  port: number;
  /** The callback URL to use as redirect_uri */
  callbackUrl: string;
  /** Resolves when the OAuth callback is received (or timeout) */
  waitForCallback: () => Promise<OAuthCallbackResult>;
  /** Shut down the server early */
  close: () => void;
}

// ── HTML responses ────────────────────────────────────────────────────────

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Minara — Login Successful</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; display: flex;
         justify-content: center; align-items: center; height: 100vh; margin: 0;
         background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); color: #fff; }
  .card { text-align: center; padding: 3rem; border-radius: 1rem;
          background: rgba(255,255,255,0.08); backdrop-filter: blur(10px); }
  h1 { color: #4ade80; margin-bottom: 0.5rem; }
  p  { color: #94a3b8; }
</style>
</head>
<body>
  <div class="card">
    <h1>✔ Login Successful</h1>
    <p>You can close this tab and return to the terminal.</p>
  </div>
</body>
</html>`;

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Minara — Login Failed</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; display: flex;
         justify-content: center; align-items: center; height: 100vh; margin: 0;
         background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); color: #fff; }
  .card { text-align: center; padding: 3rem; border-radius: 1rem;
          background: rgba(255,255,255,0.08); backdrop-filter: blur(10px); }
  h1 { color: #f87171; margin-bottom: 0.5rem; }
  p  { color: #94a3b8; }
</style>
</head>
<body>
  <div class="card">
    <h1>✖ Login Failed</h1>
    <p>${msg}</p>
    <p>Please return to the terminal and try again.</p>
  </div>
</body>
</html>`;

// ── Server ────────────────────────────────────────────────────────────────

/**
 * Start a temporary local HTTP server that listens for the OAuth callback.
 *
 * @param timeoutMs  How long to wait before giving up (default: 5 minutes).
 */
export function startOAuthServer(timeoutMs = 300_000): Promise<OAuthServer> {
  return new Promise((resolveStart, rejectStart) => {
    let resolveCallback!: (result: OAuthCallbackResult) => void;
    const callbackPromise = new Promise<OAuthCallbackResult>((res) => {
      resolveCallback = res;
    });

    let settled = false;

    function settle(result: OAuthCallbackResult) {
      if (!settled) {
        settled = true;
        resolveCallback(result);
      }
    }

    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost`);

      // Only handle /callback
      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      // Parse all query params
      const rawParams: Record<string, string> = {};
      url.searchParams.forEach((v, k) => {
        rawParams[k] = v;
      });

      const errorParam = rawParams['error'] || rawParams['error_description'];

      if (errorParam) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(ERROR_HTML(errorParam));
        settle({ error: errorParam, rawParams });
      } else {
        // Try common token param names
        const accessToken =
          rawParams['access_token'] ||
          rawParams['token'] ||
          rawParams['accessToken'];

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(SUCCESS_HTML);

        settle({
          accessToken,
          userId: rawParams['user_id'] || rawParams['userId'],
          email: rawParams['email'],
          displayName: rawParams['display_name'] || rawParams['displayName'],
          rawParams,
        });
      }

      // Give browser time to load the HTML, then close
      setTimeout(() => server.close(), 2000);
    });

    // Timeout
    const timer = setTimeout(() => {
      server.close();
      settle({ error: 'Login timed out. Please try again.', rawParams: {} });
    }, timeoutMs);

    server.on('error', (err) => {
      clearTimeout(timer);
      rejectStart(err);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      resolveStart({
        port,
        callbackUrl: `http://localhost:${port}/callback`,
        waitForCallback: () => callbackPromise,
        close: () => {
          clearTimeout(timer);
          settle({ error: 'Cancelled', rawParams: {} });
          server.close();
        },
      });
    });
  });
}
