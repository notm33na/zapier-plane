'use strict';

const { getContext, request } = require('../lib/client');
const { requireProjectId, projectField, toBool } = require('../lib/fields');
const {
  toWorkItem,
  idOf,
  WORK_ITEM_EXPAND,
  SAMPLE_WORK_ITEM,
  WORK_ITEM_OUTPUT_FIELDS,
} = require('../lib/format');

const IDENTIFIER = /^[A-Z0-9]+-\d+$/;
const SEARCH_LIMIT = 100;

const sameId = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

const sameTitle = (a, b) =>
  String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Identifier shortcut. Returns the item, or null to fall through to text search.
const findByIdentifier = async (z, bundle, context, query, projectId) => {
  const identifier = query.toUpperCase();
  if (!IDENTIFIER.test(identifier)) return null;
  const response = await request(z, bundle, {
    path: `/workspaces/${encodeURIComponent(
      context.slug,
    )}/work-items/${encodeURIComponent(identifier)}/`,
    params: { expand: WORK_ITEM_EXPAND },
    planeContext: { allow404: true },
  });
  if (response.status === 404) return null;
  const item = response.data || {};
  // The identifier route isn't scoped to a project; only match in the chosen one (D19).
  return sameId(idOf(item.project), projectId) ? item : null;
};

// ARCHITECTURE §6, D8.
const perform = async (z, bundle) => {
  const context = getContext(z, bundle);
  const projectId = requireProjectId(z, bundle.inputData);
  const query = String(bundle.inputData.query || '').trim();
  const exactMatch = toBool(bundle.inputData.exact_match, true);
  if (!query) {
    throw new z.errors.Error('Enter a title or identifier to search for.', 'InvalidInput', 400);
  }

  const byIdentifier = await findByIdentifier(z, bundle, context, query, projectId);
  if (byIdentifier) return [toWorkItem(byIdentifier, context)];

  const search = await request(z, bundle, {
    path: `/workspaces/${encodeURIComponent(context.slug)}/work-items/search/`,
    params: {
      search: query,
      project_id: projectId,
      workspace_search: 'false',
      limit: SEARCH_LIMIT,
    },
  });
  const results = ((search.data && search.data.issues) || []).filter(
    (issue) => sameId(issue.project_id, projectId),
  );
  const match = exactMatch
    ? results.find((issue) => sameTitle(issue.name, query))
    : results[0];
  if (!match) return [];

  const detail = await request(z, bundle, {
    path: `/workspaces/${encodeURIComponent(
      context.slug,
    )}/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(
      match.id,
    )}/`,
    params: { expand: WORK_ITEM_EXPAND },
  });
  return [toWorkItem(detail.data, context)];
};

module.exports = {
  key: 'find_work_item',
  noun: 'Work Item',
  display: {
    label: 'Find Work Item',
    description: 'Finds a work item in a Plane project by exact title or identifier.',
  },
  operation: {
    inputFields: [
      projectField('Only work items in this project can match.'),
      {
        key: 'query',
        label: 'Title or Identifier',
        required: true,
        helpText: 'An exact title, or an identifier like `WEB-42`.',
      },
      {
        key: 'exact_match',
        label: 'Exact Title Match',
        type: 'boolean',
        required: false,
        default: 'true',
        helpText:
          'Set to No to take the first work item whose title *contains* the text.',
      },
    ],
    perform,
    sample: SAMPLE_WORK_ITEM,
    outputFields: WORK_ITEM_OUTPUT_FIELDS,
  },
};
