'use strict';

// Shared input fields (ARCHITECTURE §3).

const projectField = (extraHelp = '') => ({
  key: 'project_id',
  label: 'Project',
  required: true,
  dynamic: 'project_list.id.name',
  altersDynamicFields: true,
  helpText: `Choose the Plane project. You can also map a project ID from an earlier step.${
    extraHelp ? ` ${extraHelp}` : ''
  }`,
});

module.exports = { projectField };
