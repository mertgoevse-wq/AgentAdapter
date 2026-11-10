import { maskKey } from './util.js';

export const CLIENT_USER_AGENT = 'claude-cli/2.1.319 (external, cli)';

export class UpstreamError extends Error {
  constructor(status, message, body = '') {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.body = body;
  }
}

export function upstreamBaseUrl() {
  return (process.env.AGENTROUTER_BASE_URL || 'https://agentrouter.org').replace(/\/+$/, '');
}

export function upstreamHeaders(apiKey, extra = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'User-Agent': CLIENT_USER_AGENT,
    'x-app': 'cli',
    'anthropic-version': '2023-06-01',
    ...extra,
  };
}

export function extractErrorMessage(text) {
  const raw = String(text || '').trim();
  if (!raw) return 'AgentRouter returned an empty error response';
  try {
    const parsed = JSON.parse(raw);
    const message =
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.error ||
      parsed?.detail ||
      null;
    if (typeof message === 'string' && message.trim()) return message.trim();
  } catch {
    /* fall through to plain text */
  }
  return raw.slice(0, 500);
}

export async function fetchModels(apiKey, { timeoutMs = 20000, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(`${upstreamBaseUrl()}/v1/models`, {
      headers: upstreamHeaders(apiKey),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new UpstreamError(0, `Cannot reach AgentRouter: ${error.message}`);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new UpstreamError(response.status, extractErrorMessage(text), text);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new UpstreamError(502, 'AgentRouter returned invalid JSON for /v1/models', text);
  }

  const rawList = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];

  const models = rawList
    .filter((model) => {
      if (!model || typeof model.id !== 'string') return false;
      const types = model.supported_endpoint_types;
      return !Array.isArray(types) || types.length === 0 || types.includes('openai');
    })
    .map((model) => ({
      id: model.id,
      ownedBy: model.owned_by || model.ownedBy || null,
      endpointTypes: model.supported_endpoint_types || null,
      displayName: model.display_name || model.displayName || null,
    }));

  if (models.length === 0) {
    throw new UpstreamError(502, 'AgentRouter returned no OpenAI-compatible models', text);
  }
  return models;
}

export async function postResponses(apiKey, body, { signal, fetchImpl = fetch } = {}) {
  return fetchImpl(`${upstreamBaseUrl()}/v1/responses`, {
    method: 'POST',
    headers: upstreamHeaders(apiKey, {
      'Content-Type': 'application/json',
      Accept: body?.stream ? 'text/event-stream' : 'application/json',
    }),
    body: JSON.stringify(body),
    signal,
  });
}

export function authFailureHint(status, message) {
  if (status === 401 && /unauthorized client/i.test(message)) {
    return `${message}\n\nThe API key was not rejected; the client identification was. AgentAdapter always sends a Claude CLI user agent. If this appears in doctor, the upstream gate has changed.`;
  }
  if (status === 401) {
    return `${message}\n\nCheck the key with "agentrouter login". Current key: ${maskKey(process.env.AGENTROUTER_API_KEY)}`;
  }
  return message;
}

export function toAnthropicError(status, message, type) {
  return {
    type: 'error',
    error: {
      type: type || anthropicErrorType(status),
      message: message || 'Upstream request failed',
    },
  };
}

export function anthropicErrorType(status) {
  if (status === 400) return 'invalid_request_error';
  if (status === 401) return 'authentication_error';
  if (status === 403) return 'permission_error';
  if (status === 404) return 'not_found_error';
  if (status === 413) return 'request_too_large';
  if (status === 429) return 'rate_limit_error';
  if (status === 529) return 'overloaded_error';
  if (status >= 500) return 'api_error';
  return 'api_error';
}
