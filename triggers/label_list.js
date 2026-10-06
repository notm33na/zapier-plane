'use strict';

const { getContext, paginate } = require('../lib/client');

// Hidden trigger powering the Labels dropdown (ARCHITECTURE §3).
const perform = async (z, bundle) => {
  const projectId = bundle.inputData && bundle.inputData.project_id;
  if (!projectId) return [];
  const { slug } = getContext(z, bundle);
  const labels = await paginate(
    z,
    bundle,
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(
      projectId,
    )}/labels/`,
  );
  return labels.map((label) => ({ id: label.id, name: label.name }));
};

module.exports = {
  key: 'label_list',
  noun: 'Label',
  display: {
    label: 'List Labels',
    description: 'Lists the labels of the selected project for the Labels dropdown.',
    hidden: true,
  },
  operation: {
    perform,
    sample: { id: 'a1b2c3d4-0000-4000-8000-000000000002', name: 'bug' },
    outputFields: [
      { key: 'id', label: 'Label ID' },
      { key: 'name', label: 'Label Name' },
    ],
  },
};
