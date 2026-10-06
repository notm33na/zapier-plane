/* globals describe, it, expect, afterEach */
'use strict';

const {
  App,
  appTester,
  nock,
  BASE,
  SLUG,
  PROJECT_ID,
  makeBundle,
  plane,
  expectError,
} = require('./helpers');

const perform = App.searches.find_work_item.operation.perform;
const SEARCH = `${BASE}/workspaces/${SLUG}/work-items/search/`;
const DETAIL = (id) => `${BASE}/workspaces/${SLUG}/projects/${PROJECT_ID}/work-items/${id}/`;
const BY_IDENT = (ident) => `${BASE}/workspaces/${SLUG}/work-items/${ident}/`;
const OTHER_PROJECT = 'ffffffff-0000-4000-8000-000000000000';

const item = (overrides = {}) => ({
  id: 'w1',
  name: 'Fix login',
  sequence_id: 42,
  priority: 'high',
  state: { id: 's1', name: 'Todo', group: 'unstarted' },
  labels: [],
  assignees: [],
  project: { id: PROJECT_ID, identifier: 'WEB', name: 'Website' },
  created_at: '2026-10-06T09:15:00.000000Z',
  ...overrides,
});
const hit = (id, name, projectId = PROJECT_ID) => ({
  id,
  name,
  sequence_id: 1,
  project__identifier: 'WEB',
  project_id: projectId,
  workspace__slug: SLUG,
});

const run = (inputData) =>
  appTester(perform, makeBundle({ inputData: { project_id: PROJECT_ID, ...inputData } }));

const searchQuery = (search) => ({
  search,
  project_id: PROJECT_ID,
  workspace_search: 'false',
  limit: 100,
});

afterEach(() => nock.cleanAll());

describe('T7 Find Work Item', () => {
  it('resolves an identifier directly (case-insensitive) with one request', async () => {
    const scope = plane()
      .get(BY_IDENT('WEB-42'))
      .query({ expand: 'state,labels,assignees,project' })
      .reply(200, item());
    const results = await run({ query: ' web-42 ' });
    expect(scope.isDone()).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'w1', identifier: 'WEB-42' });
  });

  it('falls through to text search when the identifier 404s ("COVID-19")', async () => {
    const scope = plane()
      .get(BY_IDENT('COVID-19'))
      .query(true)
      .reply(404, { error: 'The required object does not exist.' })
      .get(SEARCH)
      .query(searchQuery('COVID-19'))
      .reply(200, { issues: [hit('w2', 'covid-19')] })
      .get(DETAIL('w2'))
      .query(true)
      .reply(200, item({ id: 'w2', name: 'COVID-19' }));
    const results = await run({ query: 'COVID-19' });
    expect(scope.isDone()).toBe(true);
    expect(results.map((r) => r.id)).toEqual(['w2']);
  });

  it('falls through when the identifier belongs to another project', async () => {
    const scope = plane()
      .get(BY_IDENT('OPS-1'))
      .query(true)
      .reply(200, item({ id: 'other', project: { id: OTHER_PROJECT, identifier: 'OPS' } }))
      .get(SEARCH)
      .query(searchQuery('OPS-1'))
      .reply(200, { issues: [] });
    const results = await run({ query: 'OPS-1' });
    expect(scope.isDone()).toBe(true);
    expect(results).toEqual([]);
  });

  it('exact match (default) picks the equal title, not the first contains-hit', async () => {
    const scope = plane()
      .get(SEARCH)
      .query(searchQuery('Fix login'))
      .reply(200, {
        issues: [hit('w5', 'Fix login page'), hit('w6', 'fix LOGIN ')],
      })
      .get(DETAIL('w6'))
      .query(true)
      .reply(200, item({ id: 'w6' }));
    const results = await run({ query: 'Fix login' });
    expect(scope.isDone()).toBe(true);
    expect(results[0].id).toBe('w6');
  });

  it('exact match returns [] when only partial matches exist', async () => {
    plane()
      .get(SEARCH)
      .query(true)
      .reply(200, { issues: [hit('w5', 'Fix login page')] });
    expect(await run({ query: 'Fix login', exact_match: true })).toEqual([]);
  });

  it.each([false, 'false', 'no'])('exact_match=%p takes the first contains-hit', async (value) => {
    const scope = plane()
      .get(SEARCH)
      .query(true)
      .reply(200, { issues: [hit('w5', 'Fix login page')] })
      .get(DETAIL('w5'))
      .query(true)
      .reply(200, item({ id: 'w5' }));
    const results = await run({ query: 'Fix login', exact_match: value });
    expect(scope.isDone()).toBe(true);
    expect(results[0].id).toBe('w5');
  });

  it('ignores search hits from other projects', async () => {
    plane()
      .get(SEARCH)
      .query(true)
      .reply(200, { issues: [hit('x', 'Fix login', OTHER_PROJECT)] });
    expect(await run({ query: 'Fix login' })).toEqual([]);
  });

  it('matches a project ID mapped in upper case', async () => {
    const scope = plane()
      .get(BY_IDENT('WEB-42'))
      .query(true)
      .reply(200, item());
    const results = await run({ project_id: PROJECT_ID.toUpperCase(), query: 'WEB-42' });
    expect(scope.isDone()).toBe(true);
    expect(results).toHaveLength(1);
  });

  it('blank mapped project -> "Project is required."', async () => {
    const err = await expectError(run({ project_id: '', query: 'x' }));
    expect(err.message).toBe('Project is required.');
  });

  it('no match -> [] (no error)', async () => {
    plane().get(SEARCH).query(true).reply(200, { issues: [] });
    expect(await run({ query: 'Nothing like this' })).toEqual([]);
  });

  it('blank query -> clear error, no request', async () => {
    const err = await expectError(run({ query: '  ' }));
    expect(err.message).toBe('Enter a title or identifier to search for.');
  });

  it('a 403 on the identifier lookup is still an error, not "not found"', async () => {
    plane()
      .get(BY_IDENT('WEB-1'))
      .query(true)
      .reply(403, { detail: 'You do not have permission to perform this action.' });
    const err = await expectError(run({ query: 'WEB-1' }));
    expect(err.message).toContain("can't do this in this project");
  });
});

describe('T7 Find or Create wiring', () => {
  it('pairs find_work_item with create_work_item under the search key', () => {
    expect(App.searchOrCreates.find_work_item).toMatchObject({
      key: 'find_work_item',
      search: 'find_work_item',
      create: 'create_work_item',
    });
  });

  it('search and create share the project_id field', () => {
    const keys = (op) => op.operation.inputFields.map((f) => f.key);
    expect(keys(App.searches.find_work_item)).toContain('project_id');
    expect(keys(App.creates.create_work_item)).toContain('project_id');
  });
});
