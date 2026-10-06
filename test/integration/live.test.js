/* globals describe, it, expect, beforeAll, afterAll */
'use strict';

// Live tests against a real Plane workspace (PRD §6: T1, T5b, T12, T13).
// Reads PLANE_API_KEY / PLANE_WORKSPACE_SLUG (/ PLANE_URL) from .env.
// Never logs them: every failure message is scrubbed before Jest prints it.

const zapier = require('zapier-platform-core');

zapier.tools.env.inject();

const App = require('../../index');
const { MESSAGES, workspaceMessage } = require('../../lib/errors');
const {
  normalizeSlug,
  resolveBases,
  request,
  paginate,
} = require('../../lib/client');

const appTester = zapier.createAppTester(App);

const API_KEY = process.env.PLANE_API_KEY || '';
const RAW_SLUG = process.env.PLANE_WORKSPACE_SLUG || '';
const PLANE_URL = process.env.PLANE_URL || '';
const SLUG = normalizeSlug(RAW_SLUG);
const HAS_CREDS = Boolean(API_KEY && SLUG);

const SECRETS = [API_KEY, RAW_SLUG, SLUG].filter((s) => s && s.length >= 3);
const scrub = (text) =>
  SECRETS.reduce((acc, secret) => acc.split(secret).join('[redacted]'), String(text));

// Wraps a test body so assertion diffs and API errors can't leak secrets.
const safe = (fn) => async () => {
  try {
    await fn();
  } catch (err) {
    const clean = new Error(scrub(err && err.message));
    clean.stack = scrub(err && err.stack);
    throw clean;
  }
};

const bundle = (authData = {}, meta = {}) => ({
  authData: { api_key: API_KEY, workspace_slug: RAW_SLUG, plane_url: PLANE_URL, ...authData },
  inputData: {},
  meta,
});

const run = (fn, b = bundle()) => appTester(fn, b);
const apiBase = () => resolveBases({ errors: { Error } }, PLANE_URL).apiBase;
const RUN_ID = `zapier-int-${Date.now().toString(36)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const created = { workItems: [], labels: [] };
let projectId;

const projectPath = () =>
  `/workspaces/${encodeURIComponent(SLUG)}/projects/${projectId}`;

const createWorkItem = async (name) => {
  const response = await run((z, b) =>
    request(z, b, { path: `${projectPath()}/work-items/`, method: 'POST', body: { name } }),
  );
  created.workItems.push(response.data.id);
  return response.data;
};

const createLabel = async (name) => {
  const response = await run((z, b) =>
    request(z, b, { path: `${projectPath()}/labels/`, method: 'POST', body: { name } }),
  );
  created.labels.push(response.data.id);
  return response.data;
};

const deleteQuietly = async (path) => {
  try {
    await run((z, b) => request(z, b, { path, method: 'DELETE' }));
  } catch (err) {
    // Cleanup must not mask the real failure; it is reported without secrets.
    // eslint-disable-next-line no-console
    console.warn(scrub(`Cleanup failed for ${path}: ${err.message}`));
  }
};

const describeLive = HAS_CREDS ? describe : describe.skip;

describeLive('live Plane API', () => {
  beforeAll(
    safe(async () => {
      const projects = await run(App.triggers.project_list.operation.perform);
      if (!projects.length) {
        throw new Error('The test workspace needs at least one project.');
      }
      projectId = projects[0].id;
    }),
  );

  afterAll(async () => {
    for (const id of created.workItems) {
      await deleteQuietly(`${projectPath()}/work-items/${id}/`);
    }
    for (const id of created.labels) {
      await deleteQuietly(`${projectPath()}/labels/${id}/`);
    }
  });

  it(
    'T10 end to end: dropdowns -> create -> find (title, identifier) -> trigger',
    safe(async () => {
      const withInput = (inputData) => ({ ...bundle(), inputData });

      const projects = await run(App.triggers.project_list.operation.perform);
      expect(projects.map((p) => p.id)).toContain(projectId);
      const states = await run(
        App.triggers.state_list.operation.perform,
        withInput({ project_id: projectId }),
      );
      expect(states.length).toBeGreaterThan(0);
      const state = states[0];

      const title = `${RUN_ID} T10 café ✓`;
      const item = await run(
        App.creates.create_work_item.operation.perform,
        withInput({
          project_id: projectId,
          name: title,
          description: 'First line & <tag>\nSecond line',
          priority: 'medium',
          state_id: state.id,
        }),
      );
      created.workItems.push(item.id);
      expect(item.name).toBe(title);
      expect(item.priority).toBe('medium');
      expect(item.state_id).toBe(state.id);
      expect(item.state_name).toBe(state.name);
      expect(item.description_text).toBe('First line & <tag>\nSecond line');
      expect(item.identifier).toMatch(/^[A-Z0-9]+-\d+$/);
      expect(item.url.endsWith(`/browse/${item.identifier}/`)).toBe(true);

      const find = (inputData) =>
        run(App.searches.find_work_item.operation.perform, withInput({ project_id: projectId, ...inputData }));

      const byTitle = await find({ query: title.toUpperCase() });
      expect(byTitle.map((r) => r.id)).toEqual([item.id]);

      const byIdentifier = await find({ query: item.identifier.toLowerCase() });
      expect(byIdentifier.map((r) => r.id)).toEqual([item.id]);
      expect(byIdentifier[0].state_name).toBe(state.name);

      // Find or Create would create here: the exact title doesn't exist.
      expect(await find({ query: `${RUN_ID} no such title` })).toEqual([]);

      const triggered = await run(
        App.triggers.new_work_item.operation.perform,
        withInput({ project_id: projectId }),
      );
      expect(triggered[0].id).toBe(item.id);
    }),
  );

  it(
    'T1 connection test returns the user and slug',
    safe(async () => {
      const result = await run(App.authentication.test, bundle({}, { isTestingAuth: true }));
      expect(typeof result.id).toBe('string');
      expect(Boolean(result.display_name || result.email)).toBe(true);
      expect(result.workspace_slug === SLUG).toBe(true);
      const label = App.authentication.connectionLabel(null, { inputData: result });
      expect(label.endsWith(`(${SLUG})`)).toBe(true);
    }),
  );

  it(
    'T13 a bogus key is rejected with 403 + auth detail (D17)',
    safe(async () => {
      const response = await fetch(`${apiBase()}/api/v1/users/me/`, {
        headers: { 'X-API-Key': 'plane_api_not_a_real_key_0000000000', Accept: 'application/json' },
      });
      const body = await response.json().catch(() => ({}));
      // D17: DRF answers a bad key with 403 (no authenticate_header); 401 is handled too.
      expect([401, 403]).toContain(response.status);
      if (response.status === 403) {
        expect(String(body.detail || '')).toMatch(/token|credentials/i);
      }

      const err = await run(
        App.authentication.test,
        bundle({ api_key: 'plane_api_not_a_real_key_0000000000' }, { isTestingAuth: true }),
      ).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain(MESSAGES.badKey);
    }),
  );

  it(
    'T13 a bogus workspace slug gives the workspace message',
    safe(async () => {
      const bogus = `${RUN_ID}-no-such-workspace`;
      const response = await fetch(
        `${apiBase()}/api/v1/workspaces/${bogus}/projects/?per_page=1`,
        { headers: { 'X-API-Key': API_KEY, Accept: 'application/json' } },
      );
      expect([403, 404]).toContain(response.status);

      const err = await run(
        App.authentication.test,
        bundle({ workspace_slug: bogus }, { isTestingAuth: true }),
      ).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain(workspaceMessage(bogus));
    }),
  );

  it(
    'T5b newest work item comes first (API order and trigger output)',
    safe(async () => {
      const older = await createWorkItem(`${RUN_ID} older`);
      await sleep(1500);
      const newer = await createWorkItem(`${RUN_ID} newer`);

      // Raw API order, before the client-side sort fallback.
      const raw = await run((z, b) =>
        request(z, b, {
          path: `${projectPath()}/work-items/`,
          params: { order_by: '-created_at', per_page: 100 },
        }),
      );
      const rawIds = (raw.data.results || []).map((item) => item.id);
      expect(rawIds[0]).toBe(newer.id);
      expect(rawIds.indexOf(newer.id)).toBeLessThan(rawIds.indexOf(older.id));

      const results = await run(App.triggers.new_work_item.operation.perform, {
        ...bundle(),
        inputData: { project_id: projectId },
      });
      expect(results[0].id).toBe(newer.id);
      expect(results[0].identifier).toMatch(/^[A-Z0-9]+-\d+$/);
      expect(results[0].url.endsWith(`/browse/${results[0].identifier}/`)).toBe(true);
      expect(new Set(results.map((r) => r.id)).size).toBe(results.length);
    }),
  );

  it(
    'T12 dropdown pagination follows next_cursor (per_page=2)',
    safe(async () => {
      for (let i = 1; i <= 3; i += 1) {
        await createLabel(`${RUN_ID}-${i}`);
      }
      const labelsPath = `${projectPath()}/labels/`;

      const onePage = await run((z, b) =>
        paginate(z, b, labelsPath, { perPage: 100, maxPages: 1 }),
      );
      const walked = await run((z, b) =>
        paginate(z, b, labelsPath, { perPage: 2, maxPages: 100 }),
      );

      const walkedIds = walked.map((label) => label.id);
      expect(new Set(walkedIds).size).toBe(walkedIds.length); // pages don't repeat
      expect(walkedIds.length).toBe(onePage.length); // nothing skipped
      created.labels.forEach((id) => expect(walkedIds).toContain(id));
    }),
  );
});

if (!HAS_CREDS) {
  describe('live Plane API', () => {
    it.skip('skipped: set PLANE_API_KEY and PLANE_WORKSPACE_SLUG in .env', () => {});
  });
}
