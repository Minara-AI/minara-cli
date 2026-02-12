import { get, post, del } from './client.js';
import type { EmailCodeDto, EmailVerifyDto, AuthUser, FavoriteTokensPayload, OAuthProvider } from '../types.js';

/** Send email verification code */
export function sendEmailCode(dto: EmailCodeDto) {
  return post<void>('/auth/email/code', { body: dto });
}

/** Verify email code → returns user + access_token */
export function verifyEmailCode(dto: EmailVerifyDto) {
  return post<AuthUser>('/auth/email/verify', { body: dto });
}

/** Get current user info */
export function getCurrentUser(token: string) {
  return get<AuthUser>('/auth/me', { token });
}

/** Logout */
export function logout(token: string) {
  return post<void>('/auth/logout', { token });
}

/** Get OAuth authorization URL */
export function getOAuthUrl(provider: OAuthProvider, redirectUri: string) {
  return get<{ url: string }>(`/auth/${provider}/authorize`, {
    query: { redirect_uri: redirectUri },
  });
}

/**
 * Exchange OAuth callback params for an access token.
 * Some providers require a separate exchange step.
 */
export function oauthCallback(provider: OAuthProvider, params: Record<string, string>) {
  return get<AuthUser>(`/auth/${provider}/callback`, { query: params });
}

/** Delete account */
export function deleteAccount(token: string) {
  return del<void>('/auth/delete-account', { token });
}

/** Get favorite tokens */
export function getFavoriteTokens(token: string) {
  return get<{ tokens: string[] }>('/auth/favorite-tokens', { token });
}

/** Add favorite tokens */
export function addFavoriteTokens(token: string, payload: FavoriteTokensPayload) {
  return post<{ tokens: string[] }>('/auth/favorite-tokens', { token, body: payload });
}

/** Get invite history */
export function getInviteHistory(token: string) {
  return get<unknown>('/auth/invite-history', { token });
}
