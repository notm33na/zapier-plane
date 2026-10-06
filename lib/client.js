'use strict';

// All HTTP to Plane goes through this module (ARCHITECTURE §1, §7).

const CLOUD_API_BASE = 'https://api.plane.so';
const CLOUD_WEB_BASE = 'https://app.plane.so';
const CLOUD_HOSTS = new Set(['api.plane.so', 'app.plane.so']);

const REQUEST_TIMEOUT_MS = 10000;
const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const PAGINATE_DEADLINE_MS = 25000;

const appError = (z, message) => new z.errors.Error(message, 'PlaneError');

// "acme", " ACME ", "/acme/", "https://app.plane.so/acme/projects" -> "acme"
const normalizeSlug = (raw) => {
  let value = String(raw || '').trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch (err) {
      // fall through and treat it as a plain slug
    }
  }
  const segment = value.split('/').find((part) => part.trim() !== '') || '';
  return segment.trim().toLowerCase();
};

// Zapier can't reach these, and allowing them would let the URL field probe
// internal networks (SSRF).
const isPrivateHost = (rawHost) => {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  return host === '::1' || host === '::' || /^f[cd]/.test(host) || host.startsWith('fe80');
};

// Returns { apiBase, webBase } or throws before any request is made (FR1).
const resolveBases = (z, rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) {
    return { apiBase: CLOUD_API_BASE, webBase: CLOUD_WEB_BASE };
  }
  if (!/^https:\/\//i.test(value)) {
    throw appError(z, 'Plane URL must start with https://');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch (err) {
    throw appError(
      z,
      'Plane URL is not a valid URL. Use something like https://plane.example.com',
    );
  }

  if (isPrivateHost(parsed.hostname)) {
    throw appError(
      z,
      'Plane URL must be a public address. Zapier cannot reach localhost or private networks.',
    );
  }

  if (CLOUD_HOSTS.has(parsed.hostname.toLowerCase())) {
    return { apiBase: CLOUD_API_BASE, webBase: CLOUD_WEB_BASE };
  }

  let path = parsed.pathname.replace(/\/+$/, '');
  path = path.replace(/\/api\/v1$/i, '').replace(/\/api$/i, '');
  const base = `${parsed.origin}${path}`;
  return { apiBase: base, webBase: base };
};

const getContext = (z, bundle) => {
  const authData = bundle.authData || {};
  const slug = normalizeSlug(authData.workspace_slug);
  if (!slug) {
    throw appError(
      z,
      'Workspace slug is missing. Reconnect Plane and enter the slug from your Plane URL.',
    );
  }
  return { ...resolveBases(z, authData.plane_url), slug };
};

const isZapierError = (z, err) =>
  Object.values(z.errors).some(
    (ErrorClass) =>
      typeof ErrorClass === 'function' &&
      ErrorClass.prototype &&
      err instanceof ErrorClass,
  );

// path is relative to /api/v1, e.g. "/users/me/". Extra keys (planeContext)
// are read by the error middleware in lib/errors.js.
const request = async (z, bundle, { path, ...options }) => {
  const { apiBase } = resolveBases(z, (bundle.authData || {}).plane_url);
  const allow404 = Boolean(options.planeContext && options.planeContext.allow404);
  try {
    return await z.request({
      url: `${apiBase}/api/v1${path}`,
      method: 'GET',
      timeout: REQUEST_TIMEOUT_MS,
      // Let lib/errors.js turn 429s into our own ThrottledError.
      throwForThrottlingEarly: false,
      // lib/errors.js still throws for every other status; core must not throw a 404.
      ...(allow404 ? { skipThrowForStatus: true } : {}),
      ...options,
    });
  } catch (err) {
    if (isZapierError(z, err)) {
      throw err;
    }
    throw appError(
      z,
      `Couldn't reach Plane at ${apiBase}${
        err && err.code ? ` (${err.code})` : ''
      }. Check the Plane URL in your connection.`,
    );
  }
};

// Follows v1 cursor pagination. Accepts a plain array body too (ARCHITECTURE §7).
const paginate = async (z, bundle, path, options = {}) => {
  const {
    params = {},
    perPage = PAGE_SIZE,
    maxPages = MAX_PAGES,
    deadlineMs = PAGINATE_DEADLINE_MS,
    now = Date.now,
  } = options;
  const startedAt = now();
  const items = [];
  let cursor;

  for (let page = 0; page < maxPages; page += 1) {
    // Only start a request that can finish (timeout included) before the deadline.
    if (page > 0 && now() - startedAt + REQUEST_TIMEOUT_MS > deadlineMs) {
      break;
    }
    const response = await request(z, bundle, {
      path,
      params: { ...params, per_page: perPage, ...(cursor ? { cursor } : {}) },
    });
    const body = response.data;
    if (Array.isArray(body)) {
      items.push(...body);
      break;
    }
    items.push(...((body && body.results) || []));
    if (!body || !body.next_page_results || !body.next_cursor) {
      break;
    }
    cursor = body.next_cursor;
  }
  return items;
};

module.exports = {
  CLOUD_API_BASE,
  CLOUD_WEB_BASE,
  REQUEST_TIMEOUT_MS,
  normalizeSlug,
  resolveBases,
  getContext,
  request,
  paginate,
};
