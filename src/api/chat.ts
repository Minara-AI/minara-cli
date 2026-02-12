import { get, post, put, del } from './client.js';
import { loadConfig } from '../config.js';
import type { ChatRequestDTO, ChatInfo, ChatMemory } from '../types.js';

/** Send chat message — returns SSE stream (raw Response) */
export async function sendChatStream(token: string, dto: ChatRequestDTO): Promise<Response> {
  const config = loadConfig();
  const base = config.baseUrl.replace(/\/$/, '');
  const url = `${base}/v1/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${token}`,
      'Origin': 'https://minara.ai',
      'Referer': 'https://minara.ai/',
      'User-Agent': 'Minara-CLI/1.0',
    },
    body: JSON.stringify(dto),
  });
  return res;
}

/** Stop a running chat */
export function stopChat(token: string, messageId: string) {
  return post<void>('/v1/chat/stop', { token, query: { messageId } });
}

/** List chats */
export function listChats(token: string, limit = 20, offset = 0) {
  return get<ChatInfo[]>('/v1/chats', { token, query: { limit, offset } });
}

/** Get chat detail */
export function getChat(token: string, chatId: string) {
  return get<ChatInfo>(`/v1/chat/${encodeURIComponent(chatId)}`, { token });
}

/** Get chat memories (messages) */
export function getMemories(token: string, chatId: string, limit?: number, nextCursor?: string) {
  return get<ChatMemory[]>(`/v1/chat/${encodeURIComponent(chatId)}/memories`, {
    token,
    query: { limit, nextCursor },
  });
}

/** Update chat name */
export function updateChatName(token: string, chatId: string, name: string) {
  return put<void>(`/v1/chat/${encodeURIComponent(chatId)}`, { token, body: { name } });
}

/** Delete chat */
export function deleteChat(token: string, chatId: string) {
  return del<void>(`/v1/chat/${encodeURIComponent(chatId)}`, { token });
}

/** Search chats */
export function searchChats(token: string, query: string, limit = 10, offset = 0) {
  return get<ChatInfo[]>('/v1/chat/search', { token, query: { query, limit, offset } });
}

/** Get available chat models */
export function getChatModels(token: string) {
  return get<Record<string, unknown>[]>('/v1/chat/models', { token });
}
