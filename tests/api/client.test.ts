/**
 * Unit tests for src/api/client.ts
 *
 * Tests HTTP request building, token injection, error handling, and
 * response parsing. Uses a mocked global `fetch`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config module to return a fixed baseUrl
vi.mock('../../src/config.js', () => ({
  loadConfig: () => ({ baseUrl: 'https://test-api.minara.ai' }),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { request, get, post, put, del, patch } from '../../src/api/client.js';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(text: string, status = 200) {
  return new Response(text, { status });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('API client', () => {
  // ── URL building ─────────────────────────────────────────────────────

  describe('URL building', () => {
    it('should construct URL from baseUrl + path', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ data: 'ok' }));

      await get('/v1/test');

      expect(mockFetch).toHaveBeenCalledOnce();
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe('https://test-api.minara.ai/v1/test');
    });

    it('should append query parameters', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));

      await get('/search', { query: { keyword: 'btc', limit: 10 } });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('keyword=btc');
      expect(calledUrl).toContain('limit=10');
    });

    it('should skip undefined query values', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));

      await get('/search', { query: { keyword: 'eth', empty: undefined } });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('keyword=eth');
      expect(calledUrl).not.toContain('empty');
    });
  });

  // ── Token injection ──────────────────────────────────────────────────

  describe('token injection', () => {
    it('should add Authorization header when token is provided', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));

      await get('/me', { token: 'my-secret-token' });

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-secret-token');
    });

    it('should not add Authorization header when no token', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));

      await get('/public');

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  // ── HTTP methods ─────────────────────────────────────────────────────

  describe('HTTP methods', () => {
    it('GET request should use GET method', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));
      await get('/test');
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('POST request should use POST method and include body', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));
      await post('/test', { body: { name: 'hello' } });

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ name: 'hello' }));
    });

    it('PUT request should use PUT method', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));
      await put('/test', { body: { id: 1 } });
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });

    it('DELETE request should use DELETE method', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));
      await del('/test');
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });

    it('PATCH request should use PATCH method', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));
      await patch('/test', { body: { field: 'value' } });
      expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    });

    it('GET request should not include body even if provided', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));
      await get('/test', { body: { ignored: true } } as never);

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      expect(init.body).toBeUndefined();
    });
  });

  // ── Response parsing ─────────────────────────────────────────────────

  describe('response parsing', () => {
    it('should extract data from { data: ... } wrapper', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ data: { id: 1, name: 'test' } }));

      const res = await get<{ id: number; name: string }>('/test');

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ id: 1, name: 'test' });
    });

    it('should return raw object when no data wrapper', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: 2, value: 'raw' }));

      const res = await get<{ id: number; value: string }>('/test');

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ id: 2, value: 'raw' });
    });

    it('should handle non-JSON success response', async () => {
      mockFetch.mockResolvedValue(textResponse('plain text'));

      const res = await get<string>('/text-endpoint');

      expect(res.success).toBe(true);
      expect(res.data).toBe('plain text');
    });
  });

  // ── Error handling ───────────────────────────────────────────────────

  describe('error handling', () => {
    it('should return error for non-OK JSON response', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ message: 'Unauthorized' }, 401),
      );

      const res = await get('/protected');

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe(401);
      expect(res.error?.message).toBe('Unauthorized');
    });

    it('should return error for non-OK non-JSON response', async () => {
      mockFetch.mockResolvedValue(textResponse('Server Error', 500));

      const res = await get('/broken');

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe(500);
      expect(res.error?.message).toBe('Server Error');
    });

    it('should handle network error (fetch throws)', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const res = await get('/unreachable');

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe(0);
      expect(res.error?.message).toBe('Network failure');
    });

    it('should handle non-Error thrown objects', async () => {
      mockFetch.mockRejectedValue('string error');

      const res = await get('/bad');

      expect(res.success).toBe(false);
      expect(res.error?.message).toBe('string error');
    });

    it('should use `error` field from API error body', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: 'forbidden_access' }, 403),
      );

      const res = await get('/forbidden');

      expect(res.success).toBe(false);
      expect(res.error?.message).toBe('forbidden_access');
    });
  });

  // ── Custom headers ──────────────────────────────────────────────────

  describe('custom headers', () => {
    it('should merge custom headers', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));

      await request('/test', {
        headers: { 'X-Custom': 'my-value' },
      });

      const init = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Custom']).toBe('my-value');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });
});
