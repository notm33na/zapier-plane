/* globals describe, it, expect, afterEach */
'use strict';

const {
  App,
  appTester,
  nock,
  BASE,
  SLUG,
  makeBundle,
  plane,
  expectError,
} = require('./helpers');
const { MESSAGES, workspaceMessage } = require('../lib/errors');
const { normalizeSlug, resolveBases } = require('../lib/client');

const authBundle = (authData = {}) =>
  makeBundle({ authData, meta: { isTestingAuth: true } });

const ME = {
  id: '16c61a3a-0000-4000-8000-000000000009',
  display_name: 'Dana Lee',
  email: 'dana@example.com',
};

afterEach(() => nock.cleanAll());

describe('T1 connection test + label', () => {
  it('checks the key and the workspace, then returns name + slug', async () => {
    const scope = plane()
      .get(`${BASE}/users/me/`)
      .reply(200, ME)
      .get(`${BASE}/workspaces/${SLUG}/projects/`)
      .query({ per_page: 1 })
      .reply(200, { results: [], next_page_results: false });

    const result = await appTester(App.authentication.test, authBundle());
    expect(result).toEqual({
      id: ME.id,
      display_name: 'Dana Lee',
      email: 'dana@example.com',
      workspace_slug: SLUG,
    });
    expect(scope.isDone()).toBe(true);

    const label = App.authentication.connectionLabel(null, { inputData: result });
    expect(label).toBe('Dana Lee (acme)');
  });

  it('uses the normalised slug in the request and the label', async () => {
    plane()
      .get(`${BASE}/users/me/`)
      .reply(200, ME)
      .get(`${BASE}/workspaces/${SLUG}/projects/`)
      .query(true)
      .reply(200, { results: [] });

    const result = await appTester(
      App.authentication.test,
      authBundle({ workspace_slug: ' https://app.plane.so/ACME/projects ' }),
    );
    expect(result.workspace_slug).toBe('acme');
  });

  it('falls back to email when there is no display name', () => {
    const label = App.authentication.connectionLabel(null, {
      inputData: { email: 'dana@example.com', workspace_slug: 'acme' },
    });
    expect(label).toBe('dana@example.com (acme)');
  });
});

describe('T2 bad key vs wrong workspace', () => {
  it('maps a 401 from users/me to the bad-key message', async () => {
    plane().get(`${BASE}/users/me/`).reply(401, { detail: 'Unauthorized' });
    const err = await expectError(appTester(App.authentication.test, authBundle()));
    expect(err.message).toBe(MESSAGES.badKey);
    expect(err.code).toBe('InvalidApiKey');
  });

  it('maps DRF 403 "Given API token is not valid" to the bad-key message (D17)', async () => {
    plane()
      .get(`${BASE}/users/me/`)
      .reply(403, { detail: 'Given API token is not valid' });
    const err = await expectError(appTester(App.authentication.test, authBundle()));
    expect(err.message).toBe(MESSAGES.badKey);
  });

  it('maps a 403 on the workspace check to the workspace message', async () => {
    plane()
      .get(`${BASE}/users/me/`)
      .reply(200, ME)
      .get(`${BASE}/workspaces/${SLUG}/projects/`)
      .query(true)
      .reply(403, { detail: 'You do not have permission to perform this action.' });
    const err = await expectError(appTester(App.authentication.test, authBundle()));
    expect(err.message).toBe(workspaceMessage(SLUG));
    expect(err.code).toBe('WorkspaceNotFound');
  });

  it('maps a 404 on the workspace check to the workspace message', async () => {
    plane()
      .get(`${BASE}/users/me/`)
      .reply(200, ME)
      .get(`${BASE}/workspaces/${SLUG}/projects/`)
      .query(true)
      .reply(404, { error: 'The requested resource does not exist.' });
    const err = await expectError(appTester(App.authentication.test, authBundle()));
    expect(err.message).toBe(workspaceMessage(SLUG));
  });

  it('outside the auth test, a bad key raises ExpiredAuthError', async () => {
    plane()
      .get(`${BASE}/workspaces/${SLUG}/projects/`)
      .query(true)
      .reply(403, { detail: 'Authentication credentials were not provided.' });
    const err = await expectError(
      appTester(App.triggers.project_list.operation.perform, makeBundle()),
    );
    expect(err.name).toBe('ExpiredAuthError');
    expect(err.message).toContain(MESSAGES.badKey);
  });

  it('outside the auth test, other 403s get the permission message', async () => {
    plane()
      .get(`${BASE}/workspaces/${SLUG}/projects/`)
      .query(true)
      .reply(403, { detail: 'You do not have permission to perform this action.' });
    const err = await expectError(
      appTester(App.triggers.project_list.operation.perform, makeBundle()),
    );
    expect(err.message).toBe(MESSAGES.forbidden);
  });
});

describe('T3 normalisation', () => {
  const z = { errors: { Error: class extends Error {} } };
  const cloud = {
    apiBase: 'https://api.plane.so',
    webBase: 'https://app.plane.so',
  };

  it.each([
    ['', cloud],
    [undefined, cloud],
    ['  ', cloud],
    ['https://api.plane.so', cloud],
    ['https://api.plane.so/', cloud],
    ['https://api.plane.so/api/v1', cloud],
    ['https://app.plane.so', cloud],
    ['https://app.plane.so/acme/projects', cloud],
    [
      'https://plane.example.com',
      { apiBase: 'https://plane.example.com', webBase: 'https://plane.example.com' },
    ],
    [
      'https://plane.example.com/',
      { apiBase: 'https://plane.example.com', webBase: 'https://plane.example.com' },
    ],
    [
      'https://plane.example.com/api',
      { apiBase: 'https://plane.example.com', webBase: 'https://plane.example.com' },
    ],
    [
      'https://plane.example.com/api/v1/',
      { apiBase: 'https://plane.example.com', webBase: 'https://plane.example.com' },
    ],
    [
      'https://example.com/plane/api/v1',
      { apiBase: 'https://example.com/plane', webBase: 'https://example.com/plane' },
    ],
  ])('plane_url %p', (input, expected) => {
    expect(resolveBases(z, input)).toEqual(expected);
  });

  it.each(['http://plane.example.com', 'plane.example.com', 'ftp://x.y'])(
    'rejects non-HTTPS plane_url %p',
    (input) => {
      expect(() => resolveBases(z, input)).toThrow('Plane URL must start with https://');
    },
  );

  it.each([
    'https://localhost',
    'https://plane.local',
    'https://127.0.0.1',
    'https://10.0.0.5/api/v1',
    'https://192.168.1.20',
    'https://172.20.0.1',
    'https://169.254.169.254',
    'https://[::1]',
  ])('rejects private plane_url %p', (input) => {
    expect(() => resolveBases(z, input)).toThrow('Plane URL must be a public address');
  });

  it('rejects http:// before any request is made', async () => {
    // No nock scope: any request would fail with a network error instead.
    const err = await expectError(
      appTester(App.authentication.test, authBundle({ plane_url: 'http://plane.local' })),
    );
    expect(err.message).toBe('Plane URL must start with https://');
  });

  it.each([
    ['acme', 'acme'],
    [' ACME ', 'acme'],
    ['/acme/', 'acme'],
    ['https://app.plane.so/acme/projects', 'acme'],
    ['https://plane.example.com/Acme/', 'acme'],
    ['', ''],
  ])('workspace_slug %p -> %p', (input, expected) => {
    expect(normalizeSlug(input)).toBe(expected);
  });

  it('sends requests to the self-hosted base', async () => {
    const scope = nock('https://plane.example.com')
      .get(`${BASE}/users/me/`)
      .reply(200, ME)
      .get(`${BASE}/workspaces/${SLUG}/projects/`)
      .query(true)
      .reply(200, { results: [] });
    await appTester(
      App.authentication.test,
      authBundle({ plane_url: 'https://plane.example.com/api/v1/' }),
    );
    expect(scope.isDone()).toBe(true);
  });
});
