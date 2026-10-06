'use strict';

const { getContext, paginate } = require('../lib/client');

// Hidden trigger powering the State dropdown (ARCHITECTURE §3).
const perform = async (z, bundle) => {
  const projectId = bundle.inputData && bundle.inputData.project_id;
  if (!projectId) return [];
  const { slug } = getContext(z, bundle);
  const states = await paginate(
    z,
    bundle,
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(
      projectId,
    )}/states/`,
  );
  return states.map((state) => ({
    id: state.id,
    name: state.name,
    group: state.group || '',
  }));
};

module.exports = {
  key: 'state_list',
  noun: 'State',
  display: {
    label: 'List States',
    description: 'Lists the states of the selected project for the State dropdown.',
    hidden: true,
  },
  operation: {
    perform,
    sample: {
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      name: 'Todo',
      group: 'unstarted',
    },
    outputFields: [
      { key: 'id', label: 'State ID' },
      { key: 'name', label: 'State Name' },
      { key: 'group', label: 'State Group' },
    ],
  },
};
