'use strict';

// Maps Plane v1 error responses to user-facing Zapier errors (ARCHITECTURE §9, D17).

const MESSAGES = {
  badKey:
    'Your Plane API key is invalid or was revoked. Create a new key under Profile settings → Personal Access Tokens and reconnect.',
  forbidden:
    "Your Plane account can't do this in this project. Ask a project admin to add you as a Member or Admin.",
  notFound:
    "Plane couldn't find that project or work item. Check that you belong to the project. Self-hosted: make sure your Plane version supports the work-items API.",
  throttled:
    "Plane's rate limit (60 requests/minute) was reached. Zapier will retry automatically.",
};

const workspaceMessage = (slug) =>
  `Workspace '${slug}' wasn't found, or you aren't a member. Check the slug in your Plane URL.`;

const DEFAULT_THROTTLE_DELAY = 60;
const MIN_THROTTLE_DELAY = 1;
const MAX_THROTTLE_DELAY = 300;

const parseBody = (response) => {
  if (response.data && typeof response.data === 'object') {
    return response.data;
  }
  try {
    return JSON.parse(response.content);
  } catch (err) {
    return null;
  }
};

const detailOf = (body) => {
  if (!body || typeof body !== 'object') return '';
  return String(body.detail || body.error || '');
};

// v1 sends {"error": "..."}, {"detail": "..."} or DRF field errors {field: ["msg"]}.
const describeBadRequest = (body) => {
  if (!body || typeof body !== 'object') return 'invalid request';
  const parts = [];
  if (body.error) parts.push(String(body.error));
  if (body.detail) parts.push(String(body.detail));
  Object.entries(body).forEach(([field, value]) => {
    if (field === 'error' || field === 'detail') return;
    const text = Array.isArray(value) ? value.join(' ') : value;
    if (typeof text === 'string' || typeof text === 'number') {
      parts.push(`${field}: ${text}`);
    }
  });
  return parts.length ? parts.join('; ') : 'invalid request';
};

// Retry-After, else X-RateLimit-Reset (epoch seconds) - now, clamped; default 60 s.
const throttleDelay = (response, nowMs = Date.now()) => {
  const retryAfter = parseInt(response.headers.get('retry-after'), 10);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.max(retryAfter, MIN_THROTTLE_DELAY);
  }
  const reset = parseInt(response.headers.get('x-ratelimit-reset'), 10);
  if (Number.isFinite(reset)) {
    const seconds = Math.ceil(reset - nowMs / 1000);
    return Math.min(Math.max(seconds, MIN_THROTTLE_DELAY), MAX_THROTTLE_DELAY);
  }
  return DEFAULT_THROTTLE_DELAY;
};

// Plane's APIKeyAuthentication has no authenticate_header, so DRF answers a
// bad or missing key with 403, not 401 (D17).
const isBadKey = (status, body) =>
  status === 401 ||
  (status === 403 && /token|credentials/i.test(detailOf(body)));

const handlePlaneErrors = (response, z, bundle) => {
  const { status } = response;
  if (status < 400) return response;

  const context = (response.request && response.request.planeContext) || {};
  if (status === 404 && context.allow404) return response;

  const body = parseBody(response);
  const testingAuth = Boolean(bundle.meta && bundle.meta.isTestingAuth);

  if (isBadKey(status, body)) {
    if (testingAuth) {
      throw new z.errors.Error(MESSAGES.badKey, 'InvalidApiKey', status);
    }
    throw new z.errors.ExpiredAuthError(MESSAGES.badKey);
  }

  if (context.workspaceCheck && (status === 403 || status === 404)) {
    throw new z.errors.Error(
      workspaceMessage(context.workspaceCheck),
      'WorkspaceNotFound',
      status,
    );
  }

  if (status === 400) {
    throw new z.errors.Error(
      `Plane rejected the request: ${describeBadRequest(body)}`,
      'BadRequest',
      status,
    );
  }
  if (status === 403) {
    throw new z.errors.Error(MESSAGES.forbidden, 'Forbidden', status);
  }
  if (status === 404) {
    throw new z.errors.Error(MESSAGES.notFound, 'NotFound', status);
  }
  if (status === 429) {
    throw new z.errors.ThrottledError(MESSAGES.throttled, throttleDelay(response));
  }
  if (status >= 500) {
    throw new z.errors.Error(
      `Plane returned a server error (${status}). Try again in a few minutes.`,
      'ServerError',
      status,
    );
  }
  throw new z.errors.Error(
    `Plane returned an unexpected error (${status}): ${describeBadRequest(body)}`,
    'UnexpectedError',
    status,
  );
};

const addApiKey = (request, z, bundle) => {
  const apiKey = bundle.authData && bundle.authData.api_key;
  if (apiKey) {
    request.headers = request.headers || {};
    request.headers['X-API-Key'] = String(apiKey).trim();
    request.headers.Accept = 'application/json';
  }
  return request;
};

module.exports = {
  MESSAGES,
  workspaceMessage,
  throttleDelay,
  describeBadRequest,
  handlePlaneErrors,
  addApiKey,
};
