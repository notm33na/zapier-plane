'use strict';

const { getContext, request } = require('./lib/client');

// Connection test (ARCHITECTURE §2): 1) the key, 2) the workspace slug.
const test = async (z, bundle) => {
  const { slug } = getContext(z, bundle);

  const meResponse = await request(z, bundle, { path: '/users/me/' });

  await request(z, bundle, {
    path: `/workspaces/${encodeURIComponent(slug)}/projects/`,
    params: { per_page: 1 },
    planeContext: { workspaceCheck: slug },
  });

  const me = meResponse.data || {};
  return {
    id: me.id,
    display_name: me.display_name,
    email: me.email,
    workspace_slug: slug,
  };
};

const connectionLabel = (z, bundle) => {
  const data = bundle.inputData || {};
  const who = data.display_name || data.email || 'Plane user';
  return `${who} (${data.workspace_slug})`;
};

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'In Plane, open Profile settings → Personal Access Tokens → Add personal access token, then paste the token here. [How to create a key](https://developers.plane.so/api-reference/introduction#generating-an-api-key).',
    },
    {
      key: 'workspace_slug',
      label: 'Workspace Slug',
      type: 'string',
      required: true,
      helpText:
        'The part after the domain in your Plane URL, e.g. `acme` in `app.plane.so/acme/projects`. Add one connection per workspace. [About workspace slugs](https://developers.plane.so/api-reference/project/list-projects).',
    },
    {
      key: 'plane_url',
      label: 'Plane URL',
      type: 'string',
      required: false,
      helpText:
        'Leave blank for Plane Cloud. Self-hosted: your instance URL, e.g. `https://plane.example.com`. It must be reachable from the internet over HTTPS.',
    },
  ],
  test,
  connectionLabel,
};
