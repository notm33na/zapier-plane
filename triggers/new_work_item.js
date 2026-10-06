'use strict';

const { getContext, request } = require('../lib/client');
const { projectField } = require('../lib/fields');
const {
  toWorkItem,
  WORK_ITEM_EXPAND,
  SAMPLE_WORK_ITEM,
  WORK_ITEM_OUTPUT_FIELDS,
} = require('../lib/format');

const byNewest = (a, b) =>
  String(b.created_at || '').localeCompare(String(a.created_at || ''));

// One page, newest first, deduped by id (ARCHITECTURE §4, D6).
const perform = async (z, bundle) => {
  const context = getContext(z, bundle);
  const projectId = bundle.inputData.project_id;
  const response = await request(z, bundle, {
    path: `/workspaces/${encodeURIComponent(
      context.slug,
    )}/projects/${encodeURIComponent(projectId)}/work-items/`,
    params: { order_by: '-created_at', per_page: 100, expand: WORK_ITEM_EXPAND },
  });
  const body = response.data || {};
  const items = Array.isArray(body) ? body : body.results || [];
  // Client-side sort guards against the API ignoring order_by (T5b fallback).
  return items
    .map((item) => toWorkItem(item, context))
    .sort(byNewest);
};

module.exports = {
  key: 'new_work_item',
  noun: 'Work Item',
  display: {
    label: 'New Work Item',
    description: 'Triggers when a work item is created in a Plane project.',
  },
  operation: {
    inputFields: [
      projectField('Checks the 100 newest work items on each poll.'),
    ],
    perform,
    sample: SAMPLE_WORK_ITEM,
    outputFields: WORK_ITEM_OUTPUT_FIELDS,
  },
};
