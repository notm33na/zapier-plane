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
const { toWorkItem, htmlToText, SAMPLE_WORK_ITEM } = require('../lib/format');

const WORK_ITEMS = `${BASE}/workspaces/${SLUG}/projects/${PROJECT_ID}/work-items/`;

const project = { id: PROJECT_ID, identifier: 'WEB', name: 'Website' };
const apiItem = (overrides) => ({
  id: 'w1',
  name: 'Customer can\'t reset password',
  sequence_id: 42,
  priority: 'high',
  description_html: '<p>Reported via <b>support</b> form &amp; email.</p>',
  state: { id: 's1', name: 'Todo', group: 'unstarted', color: '#ccc' },
  labels: [
    { id: 'l1', name: 'bug' },
    { id: 'l2', name: 'support' },
  ],
  assignees: [{ id: 'u1', display_name: 'Dana Lee' }],
  project,
  start_date: null,
  target_date: '2026-10-20',
  created_at: '2026-10-06T09:15:00.000000Z',
  updated_at: '2026-10-06T09:15:00.000000Z',
  ...overrides,
});

afterEach(() => nock.cleanAll());

describe('T5 New Work Item trigger', () => {
  const run = () =>
    appTester(
      App.triggers.new_work_item.operation.perform,
      makeBundle({ inputData: { project_id: PROJECT_ID } }),
    );

  it('requests one page newest-first with expansions and flattens items', async () => {
    const scope = plane()
      .get(WORK_ITEMS)
      .query({
        order_by: '-created_at',
        per_page: 100,
        expand: 'state,labels,assignees,project',
      })
      .reply(200, page([apiItem()], { next: '100:1:0' }));

    const results = await run();
    expect(scope.isDone()).toBe(true); // next page is NOT fetched
    expect(results).toEqual([
      {
        id: 'w1',
        identifier: 'WEB-42',
        sequence_id: 42,
        name: "Customer can't reset password",
        description_html: '<p>Reported via <b>support</b> form &amp; email.</p>',
        description_text: 'Reported via support form & email.',
        priority: 'high',
        state_id: 's1',
        state_name: 'Todo',
        state_group: 'unstarted',
        label_ids: ['l1', 'l2'],
        label_names: 'bug, support',
        assignee_names: 'Dana Lee',
        project_id: PROJECT_ID,
        project_name: 'Website',
        project_identifier: 'WEB',
        start_date: null,
        target_date: '2026-10-20',
        created_at: '2026-10-06T09:15:00.000000Z',
        updated_at: '2026-10-06T09:15:00.000000Z',
        url: 'https://app.plane.so/acme/browse/WEB-42/',
      },
    ]);
  });

  it('every item has a unique id and results are newest first even if the API is not', async () => {
    plane()
      .get(WORK_ITEMS)
      .query(true)
      .reply(
        200,
        page([
          apiItem({ id: 'old', created_at: '2026-10-01T00:00:00.000000Z' }),
          apiItem({ id: 'new', created_at: '2026-10-06T00:00:00.000000Z' }),
          apiItem({ id: 'mid', created_at: '2026-10-03T00:00:00.000000Z' }),
        ]),
      );
    const results = await run();
    expect(results.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('returns [] for an empty project', async () => {
    plane().get(WORK_ITEMS).query(true).reply(200, page([]));
    expect(await run()).toEqual([]);
  });

  it('uses the self-hosted web base for url', () => {
    const item = toWorkItem(apiItem(), {
      slug: 'acme',
      webBase: 'https://plane.example.com',
    });
    expect(item.url).toBe('https://plane.example.com/acme/browse/WEB-42/');
  });

  it('handles unexpanded relations (UUIDs) without crashing', () => {
    const item = toWorkItem(
      apiItem({ state: 's1', labels: ['l1'], assignees: ['u1'], project: PROJECT_ID }),
      { slug: 'acme', webBase: 'https://app.plane.so' },
    );
    expect(item).toMatchObject({
      state_id: 's1',
      state_name: '',
      label_ids: ['l1'],
      label_names: '',
      project_id: PROJECT_ID,
      identifier: '',
      url: '',
    });
  });

  it('sample matches the output shape', () => {
    const keys = App.triggers.new_work_item.operation.outputFields.map((f) => f.key);
    expect(Object.keys(SAMPLE_WORK_ITEM).sort()).toEqual([...keys].sort());
  });

  it('htmlToText keeps line breaks', () => {
    expect(htmlToText('<p>a</p><p>b<br>c</p>')).toBe('a\nb\nc');
  });

  it('htmlToText decodes numeric and named entities', () => {
    expect(htmlToText('<p>It&#8217;s &#x2014; Q&amp;A &#39;ok&#39;</p>')).toBe(
      'It’s — Q&A \'ok\'',
    );
  });
});
