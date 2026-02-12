/**
 * Unit tests for src/oauth-server.ts
 *
 * Tests the local HTTP callback server used for OAuth login.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { startOAuthServer, type OAuthServer } from '../src/oauth-server.js';

let server: OAuthServer | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

describe('OAuth callback server', () => {
  it('should start and listen on a random port', async () => {
    server = await startOAuthServer();

    expect(server.port).toBeGreaterThan(0);
    expect(server.callbackUrl).toBe(`http://localhost:${server.port}/callback`);
  });

  it('should capture access_token from callback query params', async () => {
    server = await startOAuthServer();

    // Simulate the OAuth redirect hitting our server
    const callbackUrl = `${server.callbackUrl}?access_token=test-jwt-token&user_id=u1&email=user@test.com`;
    const fetched = fetch(callbackUrl);

    const result = await server.waitForCallback();

    expect(result.accessToken).toBe('test-jwt-token');
    expect(result.userId).toBe('u1');
    expect(result.email).toBe('user@test.com');
    expect(result.error).toBeUndefined();

    // The HTTP response should be success HTML
    const res = await fetched;
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Login Successful');
  });

  it('should capture error from callback', async () => {
    server = await startOAuthServer();

    const callbackUrl = `${server.callbackUrl}?error=access_denied&error_description=User+cancelled`;
    fetch(callbackUrl);

    const result = await server.waitForCallback();

    expect(result.error).toContain('access_denied');
    expect(result.accessToken).toBeUndefined();
  });

  it('should support alternative token param names', async () => {
    server = await startOAuthServer();

    const callbackUrl = `${server.callbackUrl}?token=alt-token&displayName=Alice`;
    fetch(callbackUrl);

    const result = await server.waitForCallback();

    expect(result.accessToken).toBe('alt-token');
    expect(result.displayName).toBe('Alice');
  });

  it('should return 404 for non-callback paths', async () => {
    server = await startOAuthServer();

    const res = await fetch(`http://localhost:${server.port}/other`);
    expect(res.status).toBe(404);
  });

  it('should timeout and return error', async () => {
    // Very short timeout for testing
    server = await startOAuthServer(200);

    const result = await server.waitForCallback();

    expect(result.error).toContain('timed out');
  });

  it('should handle close() gracefully', async () => {
    server = await startOAuthServer();

    server.close();

    const result = await server.waitForCallback();
    expect(result.error).toBe('Cancelled');
  });
});
