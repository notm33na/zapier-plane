'use strict';

// Flat work item shape shared by trigger, create and search (ARCHITECTURE §8).

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
};

const htmlToText = (html) =>
  String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity])
    .replace(/\n{2,}/g, '\n')
    .trim();

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Plain text -> escaped HTML, one <p> per line so line breaks survive (D12).
const textToHtml = (text) => {
  const value = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!value) return '';
  return value
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
};

// Expanded relations come back as objects, unexpanded ones as UUID strings.
const idOf = (value) =>
  value && typeof value === 'object' ? value.id || null : value || null;
const objectOf = (value) => (value && typeof value === 'object' ? value : {});
const listOf = (value) => (Array.isArray(value) ? value : []);

const toWorkItem = (item, { slug, webBase }) => {
  const state = objectOf(item.state);
  const project = objectOf(item.project);
  const labels = listOf(item.labels);
  const assignees = listOf(item.assignees);

  const projectIdentifier = project.identifier || '';
  const identifier =
    projectIdentifier && item.sequence_id != null
      ? `${projectIdentifier}-${item.sequence_id}`
      : '';

  return {
    id: item.id,
    identifier,
    sequence_id: item.sequence_id != null ? item.sequence_id : null,
    name: item.name || '',
    description_html: item.description_html || '',
    description_text: htmlToText(item.description_html),
    priority: item.priority || 'none',
    state_id: idOf(item.state),
    state_name: state.name || '',
    state_group: state.group || '',
    label_ids: labels.map(idOf).filter(Boolean),
    label_names: labels
      .map((label) => objectOf(label).name)
      .filter(Boolean)
      .join(', '),
    assignee_names: assignees
      .map((user) => objectOf(user).display_name)
      .filter(Boolean)
      .join(', '),
    project_id: idOf(item.project),
    project_name: project.name || '',
    project_identifier: projectIdentifier,
    start_date: item.start_date || null,
    target_date: item.target_date || null,
    created_at: item.created_at || null,
    updated_at: item.updated_at || null,
    url: identifier ? `${webBase}/${slug}/browse/${identifier}/` : '',
  };
};

const SAMPLE_WORK_ITEM = {
  id: '5f0c6c7e-2d1a-4b8e-9c34-7a1e2b3c4d5e',
  identifier: 'WEB-42',
  sequence_id: 42,
  name: "Customer can't reset password",
  description_html: '<p>Reported via support form.</p>',
  description_text: 'Reported via support form.',
  priority: 'high',
  state_id: 'a1b2c3d4-0000-4000-8000-000000000001',
  state_name: 'Todo',
  state_group: 'unstarted',
  label_ids: ['a1b2c3d4-0000-4000-8000-000000000002'],
  label_names: 'bug, support',
  assignee_names: '',
  project_id: 'a1b2c3d4-0000-4000-8000-000000000003',
  project_name: 'Website',
  project_identifier: 'WEB',
  start_date: null,
  target_date: null,
  created_at: '2026-10-06T09:15:00.000000Z',
  updated_at: '2026-10-06T09:15:00.000000Z',
  url: 'https://app.plane.so/acme/browse/WEB-42/',
};

const WORK_ITEM_OUTPUT_FIELDS = [
  { key: 'id', label: 'Work Item ID', type: 'string', primary: true },
  { key: 'identifier', label: 'Identifier (e.g. WEB-42)', type: 'string' },
  { key: 'sequence_id', label: 'Sequence Number', type: 'integer' },
  { key: 'name', label: 'Title', type: 'string' },
  { key: 'description_html', label: 'Description (HTML)', type: 'string' },
  { key: 'description_text', label: 'Description (Plain Text)', type: 'string' },
  { key: 'priority', label: 'Priority', type: 'string' },
  { key: 'state_id', label: 'State ID', type: 'string' },
  { key: 'state_name', label: 'State Name', type: 'string' },
  { key: 'state_group', label: 'State Group', type: 'string' },
  { key: 'label_ids', label: 'Label IDs', type: 'string', list: true },
  { key: 'label_names', label: 'Label Names', type: 'string' },
  { key: 'assignee_names', label: 'Assignee Names', type: 'string' },
  { key: 'project_id', label: 'Project ID', type: 'string' },
  { key: 'project_name', label: 'Project Name', type: 'string' },
  { key: 'project_identifier', label: 'Project Identifier', type: 'string' },
  { key: 'start_date', label: 'Start Date', type: 'string' },
  { key: 'target_date', label: 'Due Date', type: 'string' },
  { key: 'created_at', label: 'Created At', type: 'datetime' },
  { key: 'updated_at', label: 'Updated At', type: 'datetime' },
  { key: 'url', label: 'Work Item URL', type: 'string' },
];

// Relations embedded on every work item read.
const WORK_ITEM_EXPAND = 'state,labels,assignees,project';

module.exports = {
  WORK_ITEM_EXPAND,
  htmlToText,
  textToHtml,
  idOf,
  toWorkItem,
  SAMPLE_WORK_ITEM,
  WORK_ITEM_OUTPUT_FIELDS,
};
