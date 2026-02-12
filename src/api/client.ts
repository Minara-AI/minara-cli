import { loadConfig } from '../config.js';
import type { ApiResponse } from '../types.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  token?: string;
  headers?: Record<string, string>;
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const config = loadConfig();
  const base = config.baseUrl.replace(/\/$/, '');
  const url = new URL(`${base}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

// ── Core request implementation ───────────────────────────────────────────

/**
 * @param isRetry  When true, skip the 401 re-auth handler to prevent loops.
 */
async function requestImpl<T>(
  path: string,
  opts: RequestOptions,
  isRetry: boolean,
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, query, token, headers: extraHeaders } = opts;

  const url = buildUrl(path, query);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Origin': 'https://minara.ai',
    'Referer': 'https://minara.ai/',
    'User-Agent': 'Minara-CLI/1.0',
    ...extraHeaders,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const init: RequestInit = { method, headers };
  if (body && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, init);

    // ── 401 interception ──────────────────────────────────────────────
    // Only trigger when: (1) authenticated request, (2) not already a retry,
    // (3) running in an interactive terminal (not piped / CI).
    if (res.status === 401 && token && !isRetry) {
      return handleAuthExpired<T>(path, opts);
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // non-JSON response
      if (!res.ok) {
        return { success: false, error: { code: res.status, message: text || res.statusText } };
      }
      // Non-JSON success response — wrap the text as data
      return { success: true, data: text as T };
    }

    if (!res.ok) {
      const errBody = json as Record<string, unknown>;
      return {
        success: false,
        error: {
          code: res.status,
          message: (errBody.message ?? errBody.error ?? res.statusText) as string,
        },
      };
    }

    // Adapt: if the API wraps data in { data: ... } or returns directly
    const data = (json as Record<string, unknown>).data ?? json;
    return { success: true, data: data as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { code: 0, message } };
  }
}

// ── 401 handler ───────────────────────────────────────────────────────────

/**
 * Called when an authenticated request returns 401.
 *
 * - In a TTY (interactive terminal): prompts the user to re-login, then
 *   retries the original request with the fresh token.
 * - In a non-TTY (pipe / CI): returns a friendly error immediately.
 *
 * Uses dynamic `import()` for `auth-refresh.ts` to break the circular
 * dependency chain: client → auth-refresh → api/auth → client.
 */
async function handleAuthExpired<T>(
  path: string,
  opts: RequestOptions,
): Promise<ApiResponse<T>> {
  // Non-interactive environments: skip prompts
  if (!process.stdin.isTTY) {
    return {
      success: false,
      error: {
        code: 401,
        message: 'Session expired. Run `minara login` to refresh your credentials.',
      },
    };
  }

  try {
    // Dynamic import — only loaded when needed, avoids circular deps
    const { attemptReAuth } = await import('../auth-refresh.js');
    const newToken = await attemptReAuth();

    if (newToken) {
      // Retry the original request with the new token (isRetry = true)
      return requestImpl<T>(path, { ...opts, token: newToken }, true);
    }
  } catch (err) {
    // Module load failure or unexpected error — log for debugging, fall through
    if (process.env.DEBUG) {
      console.error('[minara] auth-refresh error:', err instanceof Error ? err.message : err);
    }
  }

  return {
    success: false,
    error: {
      code: 401,
      message: 'Session expired. Run `minara login` to refresh your credentials.',
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  return requestImpl(path, opts, false);
}

export function get<T>(path: string, opts?: Omit<RequestOptions, 'method'>) {
  return request<T>(path, { ...opts, method: 'GET' });
}

export function post<T>(path: string, opts?: Omit<RequestOptions, 'method'>) {
  return request<T>(path, { ...opts, method: 'POST' });
}

export function put<T>(path: string, opts?: Omit<RequestOptions, 'method'>) {
  return request<T>(path, { ...opts, method: 'PUT' });
}

export function del<T>(path: string, opts?: Omit<RequestOptions, 'method'>) {
  return request<T>(path, { ...opts, method: 'DELETE' });
}

export function patch<T>(path: string, opts?: Omit<RequestOptions, 'method'>) {
  return request<T>(path, { ...opts, method: 'PATCH' });
}
