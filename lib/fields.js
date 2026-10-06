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

const stateField = {
  key: 'state_id',
  label: 'State',
  required: false,
  dynamic: 'state_list.id.name',
  helpText: "Leave blank to use the project's default state.",
};

const labelsField = {
  key: 'label_ids',
  label: 'Labels',
  required: false,
  list: true,
  dynamic: 'label_list.id.name',
  helpText: 'Labels from the selected project only.',
};

const PRIORITY_CHOICES = [
  { value: 'urgent', label: 'Urgent', sample: 'urgent' },
  { value: 'high', label: 'High', sample: 'high' },
  { value: 'medium', label: 'Medium', sample: 'medium' },
  { value: 'low', label: 'Low', sample: 'low' },
  { value: 'none', label: 'None', sample: 'none' },
];

const priorityField = {
  key: 'priority',
  label: 'Priority',
  required: false,
  choices: PRIORITY_CHOICES,
  helpText: "Leave blank to use Plane's default (None).",
};

// Mapped list values can arrive as an array or a comma-separated string.
const toList = (value) => {
  if (value == null || value === '') return [];
  const items = Array.isArray(value) ? value : String(value).split(',');
  return items.map((item) => String(item).trim()).filter(Boolean);
};

// Booleans arrive as true/false or strings like "true", "yes", "false", "no".
const toBool = (value, defaultValue) => {
  if (value == null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return !['false', 'no', '0', 'off'].includes(String(value).trim().toLowerCase());
};

// A mapped project can be blank at run time even though the field is required.
const requireProjectId = (z, inputData) => {
  const projectId = String((inputData && inputData.project_id) || '').trim().toLowerCase();
  if (!projectId) {
    throw new z.errors.Error('Project is required.', 'InvalidInput', 400);
  }
  return projectId;
};

module.exports = {
  requireProjectId,
  projectField,
  stateField,
  labelsField,
  priorityField,
  PRIORITY_CHOICES,
  toList,
  toBool,
};
