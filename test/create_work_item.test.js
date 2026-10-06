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
const { textToHtml, SAMPLE_WORK_ITEM } = require('../lib/format');

const WORK_ITEMS = `${BASE}/workspaces/${SLUG}/projects/${PROJECT_ID}/work-items/`;
const perform = App.creates.create_work_item.operation.perform;

const created = {
  id: 'w9',
  name: 'Customer can\'t reset password',
  sequence_id: 7,
  priority: 'high',
  state: 's1',
  labels: ['l1'],
  project: PROJECT_ID,
  created_at: '2026-10-06T09:15:00.000000Z',
  updated_at: '2026-10-06T09:15:00.000000Z',
};
const detail = {
  ...created,
  description_html: '<p>Line 1</p><p>Line 2</p>',
  state: { id: 's1', name: 'Todo', group: 'unstarted' },
  labels: [{ id: 'l1', name: 'bug' }],
  assignees: [],
  project: { id: PROJECT_ID, identifier: 'WEB', name: 'Website' },
};

const run = (inputData) =>
  appTester(perform, makeBundle({ inputData: { project_id: PROJECT_ID, ...inputData } }));

afterEach(() => nock.cleanAll());

describe('T6 Create Work Item', () => {
  it('posts all fields, then reads back the expanded item', async () => {
    const scope = plane()
      .post(WORK_ITEMS, {
        name: "Customer can't reset password",
        description_html: '<p>Line 1 &lt;b&gt; &amp; &quot;x&quot;</p><p>Line 2</p>',
        priority: 'high',
        state: 's1',
        labels: ['l1', 'l2'],
      })
      .reply(201, created)
      .get(`${WORK_ITEMS}w9/`)
      .query({ expand: 'state,labels,assignees,project' })
      .reply(200, detail);

    const result = await run({
      name: "  Customer can't reset password  ",
      description: 'Line 1 <b> & "x"\r\nLine 2',
      priority: 'High',
      state_id: 's1',
      label_ids: ['l1', 'l2'],
    });
    expect(scope.isDone()).toBe(true);
    expect(result).toMatchObject({
      id: 'w9',
      identifier: 'WEB-7',
      state_name: 'Todo',
      label_names: 'bug',
      url: 'https://app.plane.so/acme/browse/WEB-7/',
    });
    expect(Object.keys(result).sort()).toEqual(Object.keys(SAMPLE_WORK_ITEM).sort());
  });

  it('leaves empty optional fields out of the body', async () => {
    const scope = plane()
      .post(WORK_ITEMS, (body) => JSON.stringify(Object.keys(body)) === '["name"]')
      .reply(201, created)
      .get(`${WORK_ITEMS}w9/`)
      .query(true)
      .reply(200, detail);
    await run({ name: 'Only a title', description: '  ', priority: '', state_id: '', label_ids: [] });
    expect(scope.isDone()).toBe(true);
  });

  it('accepts labels mapped as a comma-separated string', async () => {
    const scope = plane()
      .post(WORK_ITEMS, (body) => JSON.stringify(body.labels) === '["l1","l2"]')
      .reply(201, created)
      .get(`${WORK_ITEMS}w9/`)
      .query(true)
      .reply(200, detail);
    await run({ name: 'x', label_ids: 'l1, l2' });
    expect(scope.isDone()).toBe(true);
  });

  it('rejects a 256-character title before any request', async () => {
    // nock has no interceptor: a request would fail with a network error instead.
    const err = await expectError(run({ name: 'a'.repeat(256) }));
    expect(err.message).toBe('Title is 256 characters; Plane allows 255.');
  });

  it('counts an emoji as one character (255 emoji is allowed)', async () => {
    const scope = plane().post(WORK_ITEMS).reply(201, created).get(`${WORK_ITEMS}w9/`).query(true).reply(200, detail);
    await run({ name: '😀'.repeat(255) });
    expect(scope.isDone()).toBe(true);

    const err = await expectError(run({ name: '😀'.repeat(256) }));
    expect(err.message).toBe('Title is 256 characters; Plane allows 255.');
  });

  it('rejects a blank title and an unknown priority', async () => {
    expect((await expectError(run({ name: '   ' }))).message).toBe('Title is required.');
    expect((await expectError(run({ name: 'x', priority: 'asap' }))).message).toBe(
      'Priority must be one of: urgent, high, medium, low, none.',
    );
  });

  it('returns the POST result if the read-back fails (D18)', async () => {
    const scope = plane()
      .post(WORK_ITEMS)
      .reply(201, created)
      .get(`${WORK_ITEMS}w9/`)
      .query(true)
      .reply(500, 'oops');
    const result = await run({ name: 'x' });
    expect(scope.isDone()).toBe(true);
    expect(result).toMatchObject({
      id: 'w9',
      state_id: 's1',
      state_name: '',
      label_ids: ['l1'],
      project_id: PROJECT_ID,
      identifier: '',
    });
  });

  it('surfaces Plane validation errors from the POST', async () => {
    plane()
      .post(WORK_ITEMS)
      .reply(400, { state: ['Invalid pk "nope" - object does not exist.'] });
    const err = await expectError(run({ name: 'x', state_id: 'nope' }));
    expect(err.message).toBe(
      'Plane rejected the request: state: Invalid pk "nope" - object does not exist.',
    );
  });

  it('errors clearly if the POST returns no id (no read-back of /undefined/)', async () => {
    const scope = plane().post(WORK_ITEMS).reply(201, {});
    const err = await expectError(run({ name: 'x' }));
    expect(scope.isDone()).toBe(true);
    expect(err.message).toContain('returned no ID');
  });

  it('blank mapped project -> "Project is required." with no request', async () => {
    const err = await expectError(run({ project_id: '  ', name: 'x' }));
    expect(err.message).toBe('Project is required.');
  });

  it('textToHtml escapes and keeps line breaks', () => {
    expect(textToHtml('a & b\n\n<c>')).toBe('<p>a &amp; b</p><p></p><p>&lt;c&gt;</p>');
    expect(textToHtml('')).toBe('');
  });
});
