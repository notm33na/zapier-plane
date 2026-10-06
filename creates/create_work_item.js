'use strict';

const { getContext, request } = require('../lib/client');
const {
  requireProjectId,
  projectField,
  stateField,
  labelsField,
  priorityField,
  PRIORITY_CHOICES,
  toList,
} = require('../lib/fields');
const {
  toWorkItem,
  textToHtml,
  WORK_ITEM_EXPAND,
  SAMPLE_WORK_ITEM,
  WORK_ITEM_OUTPUT_FIELDS,
} = require('../lib/format');

const MAX_TITLE = 255;
const PRIORITIES = PRIORITY_CHOICES.map((choice) => choice.value);

const buildBody = (z, input) => {
  const name = String(input.name || '').trim();
  if (!name) {
    throw new z.errors.Error('Title is required.', 'InvalidInput', 400);
  }
  // Count code points, not UTF-16 units, so an emoji counts as one (Plane is Python).
  const length = [...name].length;
  if (length > MAX_TITLE) {
    throw new z.errors.Error(
      `Title is ${length} characters; Plane allows ${MAX_TITLE}.`,
      'InvalidInput',
      400,
    );
  }

  const body = { name };
  const descriptionHtml = textToHtml(input.description);
  if (descriptionHtml) body.description_html = descriptionHtml;

  const priority = String(input.priority || '').trim().toLowerCase();
  if (priority) {
    if (!PRIORITIES.includes(priority)) {
      throw new z.errors.Error(
        `Priority must be one of: ${PRIORITIES.join(', ')}.`,
        'InvalidInput',
        400,
      );
    }
    body.priority = priority;
  }

  const stateId = String(input.state_id || '').trim();
  if (stateId) body.state = stateId;

  const labelIds = toList(input.label_ids);
  if (labelIds.length) body.labels = labelIds;

  return body;
};

// POST, then read back with expansions (ARCHITECTURE §5, D18).
const perform = async (z, bundle) => {
  const context = getContext(z, bundle);
  const projectId = requireProjectId(z, bundle.inputData);
  const body = buildBody(z, bundle.inputData);
  const basePath = `/workspaces/${encodeURIComponent(
    context.slug,
  )}/projects/${encodeURIComponent(projectId)}/work-items/`;

  const created = await request(z, bundle, { path: basePath, method: 'POST', body });
  const item = created.data || {};
  if (!item.id) {
    throw new z.errors.Error(
      'Plane created the work item but returned no ID. Check the project in Plane before re-running.',
      'PlaneError',
    );
  }

  try {
    const detail = await request(z, bundle, {
      path: `${basePath}${encodeURIComponent(item.id)}/`,
      params: { expand: WORK_ITEM_EXPAND },
    });
    return toWorkItem(detail.data, context);
  } catch (err) {
    // The work item exists. Throwing would make Zapier retry and create a duplicate.
    z.console.log(`Read-back of created work item failed; returning POST result. ${err.name}`);
    return toWorkItem({ project: projectId, ...item }, context);
  }
};

module.exports = {
  key: 'create_work_item',
  noun: 'Work Item',
  display: {
    label: 'Create Work Item',
    description: 'Creates a new work item in a Plane project.',
  },
  operation: {
    inputFields: [
      projectField(),
      {
        key: 'name',
        label: 'Title',
        required: true,
        helpText: 'The work item title. Maximum 255 characters.',
      },
      {
        key: 'description',
        label: 'Description',
        type: 'text',
        required: false,
        helpText: 'Plain text. Line breaks are kept.',
      },
      priorityField,
      stateField,
      labelsField,
    ],
    perform,
    sample: SAMPLE_WORK_ITEM,
    outputFields: WORK_ITEM_OUTPUT_FIELDS,
  },
};
