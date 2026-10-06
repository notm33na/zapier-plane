'use strict';

const { getContext, paginate } = require('../lib/client');

// Hidden trigger powering the Project dropdown (ARCHITECTURE §3).
const perform = async (z, bundle) => {
  const { slug } = getContext(z, bundle);
  const projects = await paginate(
    z,
    bundle,
    `/workspaces/${encodeURIComponent(slug)}/projects/`,
  );
  return projects
    .filter((project) => !project.archived_at)
    .map((project) => ({
      id: project.id,
      name: project.identifier
        ? `${project.name} (${project.identifier})`
        : project.name,
      identifier: project.identifier || '',
    }));
};

module.exports = {
  key: 'project_list',
  noun: 'Project',
  display: {
    label: 'List Projects',
    description: 'Lists projects for the Project dropdown.',
    hidden: true,
  },
  operation: {
    perform,
    sample: {
      id: 'a1b2c3d4-0000-4000-8000-000000000003',
      name: 'Website (WEB)',
      identifier: 'WEB',
    },
    outputFields: [
      { key: 'id', label: 'Project ID' },
      { key: 'name', label: 'Project Name' },
      { key: 'identifier', label: 'Project Identifier' },
    ],
  },
};
