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
  page,
} = require('./helpers');
const { paginate, REQUEST_TIMEOUT_MS } = require('../lib/client');

const PROJECTS = `${BASE}/workspaces/${SLUG}/projects/`;
const STATES = `${BASE}/workspaces/${SLUG}/projects/${PROJECT_ID}/states/`;
const LABELS = `${BASE}/workspaces/${SLUG}/projects/${PROJECT_ID}/labels/`;

afterEach(() => nock.cleanAll());

describe('T4 dropdowns and pagination', () => {
  it('project_list follows next_cursor and labels projects "Name (IDENT)"', async () => {
    const scope = plane()
      .get(PROJECTS)
      .query({ per_page: 100 })
      .reply(200, page([{ id: 'p1', name: 'Website', identifier: 'WEB' }], { next: '100:1:0' }))
      .get(PROJECTS)
      .query({ per_page: 100, cursor: '100:1:0' })
      .reply(
        200,
        page([
          { id: 'p2', name: 'Mobile', identifier: 'MOB' },
          { id: 'p3', name: 'Old', identifier: 'OLD', archived_at: '2026-01-01T00:00:00Z' },
        ]),
      );

    const results = await appTester(
      App.triggers.project_list.operation.perform,
      makeBundle(),
    );
    expect(results).toEqual([
      { id: 'p1', name: 'Website (WEB)', identifier: 'WEB' },
      { id: 'p2', name: 'Mobile (MOB)', identifier: 'MOB' },
    ]);
    expect(scope.isDone()).toBe(true);
  });

  it('state_list returns [] without a project and makes no request', async () => {
    const results = await appTester(
      App.triggers.state_list.operation.perform,
      makeBundle(),
    );
    expect(results).toEqual([]);
  });

  it('label_list returns [] without a project and makes no request', async () => {
    const results = await appTester(
      App.triggers.label_list.operation.perform,
      makeBundle(),
    );
    expect(results).toEqual([]);
  });

  it('state_list accepts a plain array body', async () => {
    plane()
      .get(STATES)
      .query(true)
      .reply(200, [
        { id: 's1', name: 'Todo', group: 'unstarted' },
        { id: 's2', name: 'Done', group: 'completed' },
      ]);
    const results = await appTester(
      App.triggers.state_list.operation.perform,
      makeBundle({ inputData: { project_id: PROJECT_ID } }),
    );
    expect(results).toEqual([
      { id: 's1', name: 'Todo', group: 'unstarted' },
      { id: 's2', name: 'Done', group: 'completed' },
    ]);
  });

  it('label_list reads a paginated body', async () => {
    plane()
      .get(LABELS)
      .query(true)
      .reply(200, page([{ id: 'l1', name: 'bug', color: '#f00' }]));
    const results = await appTester(
      App.triggers.label_list.operation.perform,
      makeBundle({ inputData: { project_id: PROJECT_ID } }),
    );
    expect(results).toEqual([{ id: 'l1', name: 'bug' }]);
  });

  it('stops after 5 pages', async () => {
    const scope = plane();
    for (let i = 0; i < 5; i += 1) {
      scope
        .get(PROJECTS)
        .query(true)
        .reply(200, page([{ id: `p${i}`, name: `P${i}` }], { next: `100:${i + 1}:0` }));
    }
    const results = await appTester(
      App.triggers.project_list.operation.perform,
      makeBundle(),
    );
    expect(results).toHaveLength(5);
    expect(scope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('stops before a page that could run past the 25 s deadline', async () => {
    let clock = 0;
    const scope = plane()
      .get(PROJECTS)
      .query(true)
      .reply(200, () => {
        clock += 16000; // first page "took" 16 s; 16 + 10 s timeout > 25 s
        return page([{ id: 'p1', name: 'P1' }], { next: '100:1:0' });
      });
    const results = await appTester(
      (z, bundle) =>
        paginate(z, bundle, `/workspaces/${SLUG}/projects/`, { now: () => clock }),
      makeBundle(),
    );
    expect(results).toEqual([{ id: 'p1', name: 'P1' }]);
    expect(scope.isDone()).toBe(true);
    expect(REQUEST_TIMEOUT_MS).toBe(10000);
  });
});
