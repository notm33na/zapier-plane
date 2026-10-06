# Architecture: Plane for Zapier (v1)

Zapier CLI integration (`zapier-platform-core` 19.x, Node 22). FR, NFR and T numbers refer to [PRD.md](PRD.md). D numbers refer to §10.

## 1. API surface (D1, D2)
Every call goes to **Plane REST API v1, `/work-items/` paths**. API v2 is only on Plane Cloud. Self-hosted Community Edition (CE) mounts only `api/v1/`, and the v2 docs say v1 "keeps working". The legacy `/issues/` paths are not used.

| Purpose | Method + path (prefix `{base}/api/v1`) |
|---|---|
| Current user | `GET /users/me/` |
| Projects | `GET /workspaces/{slug}/projects/` |
| States / labels | `GET /workspaces/{slug}/projects/{project_id}/states/` · `…/labels/` |
| List / create work items | `GET` / `POST /workspaces/{slug}/projects/{project_id}/work-items/` |
| Work item detail | `GET /workspaces/{slug}/projects/{project_id}/work-items/{id}/` |
| By identifier | `GET /workspaces/{slug}/work-items/{PROJ}-{seq}/` |
| Search | `GET /workspaces/{slug}/work-items/search/` |

`lib/client.js` owns all HTTP.
- It builds the base URL and adds the `X-API-Key` and `Accept: application/json` headers.
- It sets a **10 s timeout** per request.
- It wraps `z.request` in try/catch to handle network errors and timeouts (§9).
- It runs `paginate()` (§7) and registers the `afterResponse` error middleware (§9).

## 2. Authentication (FR1, FR2; D3–D5, D14, D17)
`type: 'custom'`. Fields:

| key | label | type | req | help text |
|---|---|---|---|---|
| `api_key` | API Key | password | yes | Plane → Profile settings → Personal Access Tokens → Add token. |
| `workspace_slug` | Workspace Slug | string | yes | The part after the domain in your Plane URL, e.g. `acme` in `app.plane.so/acme/projects`. Add one connection per workspace. |
| `plane_url` | Plane URL | string | no | Leave blank for Plane Cloud. Self-hosted: your instance URL, e.g. `https://plane.example.com`. It must be reachable from the internet over HTTPS. |

**Input normalisation** (`lib/client.js`):
- **Workspace slug:** trimmed and lowercased. If the user pastes a URL, the first path segment is used (`https://app.plane.so/acme/projects` → `acme`). Slashes are removed.
- **Plane URL:**
  - Blank, `https://api.plane.so` or `https://app.plane.so` → **Cloud**: API base `https://api.plane.so`, web base `https://app.plane.so`.
  - Anything else: strip trailing `/`, `/api/v1` and `/api`. The result is both the API base and the web base.
  - Anything that isn't `https://` is rejected with "Plane URL must start with https://". Localhost and private IP ranges are rejected too (Zapier can't reach them; prevents SSRF).

**Connection test** (2 requests):
1. `GET /users/me/` checks the key and returns `{id, display_name, email, …}`.
2. `GET /workspaces/{slug}/projects/?per_page=1` checks that the slug exists and the user can see it.

Both requests run with `bundle.meta.isTestingAuth` set, so the auth-only messages in §9 apply. The test returns `{id, display_name, email, workspace_slug}`.

**Connection label:** `{{bundle.inputData.display_name}} ({{bundle.inputData.workspace_slug}})`, for example `Dana Lee (acme)`.

## 3. Dropdowns: hidden triggers (FR3, FR6; D7)
| Key | Endpoint | Returns `{id, name}` | Notes |
|---|---|---|---|
| `project_list` | projects | `name: "{name} ({identifier})"` | Projects with `archived_at` set are left out. |
| `state_list` | states of `bundle.inputData.project_id` | `name: "{name}"` | `[]` if no project has been chosen yet. |
| `label_list` | labels of `bundle.inputData.project_id` | `name: "{name}"` | `[]` if no project has been chosen yet. |

**Shared field `project_id`** (`lib/fields.js`):
- label "Project", required, `dynamic: 'project_list.id.name'`, `altersDynamicFields: true` so the state and label dropdowns reload when it changes.
- Help text: "Choose the Plane project. You can also map a project ID from an earlier step."

`state_id` uses `state_list.id.name`. `label_ids` uses `label_list.id.name` with `list: true`.

## 4. Trigger: New Work Item (`new_work_item`, FR4; D6)
- **Display:** label "New Work Item". Description: "Triggers when a work item is created in a Plane project."
- **Input:** `project_id`. Its help text adds: "Checks the 100 newest work items on each poll."
- **Request:** `GET …/projects/{project_id}/work-items/?order_by=-created_at&per_page=100&expand=state,labels,assignees,project`. It reads one page only, as Zapier advises for polling. The results are also sorted client-side by `created_at` descending, which is the fallback for T5b.
- **Dedupe:** by `id` (UUID), marked `primary` in `outputFields`.
- **Output and sample:** `toWorkItem()` and §8.

## 5. Create: Create Work Item (`create_work_item`, FR5, FR6; D12, D18)
**Display:** label "Create Work Item". Description: "Creates a new work item in a Plane project."

| key | label | type | req | help text / rules |
|---|---|---|---|---|
| `project_id` | Project | dynamic | yes | — |
| `name` | Title | string | yes | Max 255 characters, counted with `[...name].length`. Longer → `z.errors.Error` "Title is N characters; Plane allows 255." and no request is sent. |
| `description` | Description | text | no | Plain text. HTML-escaped, each line wrapped in `<p>`, sent as `description_html`. |
| `priority` | Priority | string, choices `urgent, high, medium, low, none` | no | Leave blank to use Plane's default (`none`). |
| `state_id` | State | dynamic | no | Leave blank to use the project's default state. |
| `label_ids` | Labels | dynamic, `list: true` | no | "Labels from the selected project only." v1 drops label IDs from other projects without an error. |

**Requests:**
1. `POST …/work-items/` with `{name, description_html?, priority?, state?, labels?}`. Empty fields are left out.
2. `GET …/work-items/{id}/?expand=state,labels,assignees,project`.

If request 2 fails for any reason, the action returns `toWorkItem(postResponse)` instead of throwing (D18). `toWorkItem` accepts unexpanded UUIDs and fills the name fields with `""`, so a Zapier retry can't create a duplicate.

## 6. Search: Find Work Item (`find_work_item`, FR7, FR8; D8, D9)
**Display:** label "Find Work Item". Description: "Finds a work item in a Plane project by exact title or identifier."

| key | label | type | req | help text |
|---|---|---|---|---|
| `project_id` | Project | dynamic | **yes** | Only work items in this project can match (D19). |
| `query` | Title or Identifier | string | yes | An exact title, or an identifier like `WEB-42`. |
| `exact_match` | Exact Title Match | boolean, `default: 'true'` | no | Set to No to take the first title that *contains* the text. |

**Flow:**
1. Uppercase the trimmed query. If it matches `^[A-Z0-9]+-\d+$`, call `GET /workspaces/{slug}/work-items/{QUERY}/?expand=…`. This request uses `skipThrowForStatus: true` and the custom flag `allow404`, which tells the middleware to let a 404 through.
   - If the item is found and its `project` equals `project_id`, return it.
   - On a 404 or a project mismatch, continue to step 2. This covers titles like "COVID-19".
2. Call `GET /workspaces/{slug}/work-items/search/?search={query}&project_id={id}&workspace_search=false&limit=100`.
   - The response is `{"issues":[{id,name,sequence_id,project__identifier,project_id}]}`.
   - The server applies no cap on `limit`, and it only searches projects where the user is an active member.
3. Pick the first result whose `name` equals the query (trimmed, case-insensitive). If `exact_match` is false, take the first result instead. If nothing matches, return `[]`.
4. Read the item's detail with `?expand=…` and return `[toWorkItem(item)]`.

**Find or Create:**
```js
searchOrCreates: {
  find_work_item: {
    key: 'find_work_item',
    search: 'find_work_item',
    create: 'create_work_item',
    display: {
      label: 'Find or Create Work Item',
      description: 'Finds a work item by title, or creates it if none exists.',
    },
  },
}
```
The search and the create share the `project_id` key, so Zapier fills it in once.

## 7. Pagination, time and rate limits (NFR1, NFR2; D7, D11)
- **Pagination:** `paginate(url, {maxPages: 5, deadlineMs: 25000})` sends `per_page=100`.
  - If the body is a plain array, it returns the array as it is.
  - Otherwise it follows `next_cursor` while `next_page_results` is true, and joins the `results` arrays.
  - It stops at 5 pages, or when 25 s have passed since the step started. Either way it returns the pages it already has.
- **Time:** the slowest normal step is create or search, with 2 requests × 10 s = 20 s. That is under Zapier's 30 s limit.
- **Requests per step:** auth test 2, trigger 1, create 2, search 1–3, dropdown 1–5. All are far below 60 per minute per key, and there are no retry loops.
- **429:** throw `z.errors.ThrottledError(msg, delay)`, and Zapier retries after the delay.
  - The delay is `Retry-After` if present.
  - Otherwise it is `X-RateLimit-Reset − now` (epoch seconds), clamped to 1–300 s.
  - If neither header is present, the delay is 60 s.

## 8. Output shape and sample (`lib/format.js#toWorkItem`)
- `identifier` = `project.identifier` + `-` + `sequence_id`.
- `url` = `{webBase}/{slug}/browse/{identifier}/`.
- `description_text` = `description_html` with the tags stripped.

All keys below are listed in `outputFields` with labels, and `id` is marked `primary`.
```json
{
  "id": "5f0c6c7e-2d1a-4b8e-9c34-7a1e2b3c4d5e", "identifier": "WEB-42", "sequence_id": 42,
  "name": "Customer can't reset password",
  "description_html": "<p>Reported via support form.</p>", "description_text": "Reported via support form.",
  "priority": "high", "state_id": "a1b2c3d4-0000-4000-8000-000000000001", "state_name": "Todo", "state_group": "unstarted",
  "label_ids": ["a1b2c3d4-0000-4000-8000-000000000002"], "label_names": "bug, support", "assignee_names": "",
  "project_id": "a1b2c3d4-0000-4000-8000-000000000003", "project_name": "Website", "project_identifier": "WEB",
  "start_date": null, "target_date": null,
  "created_at": "2026-10-06T09:15:00.000000Z", "updated_at": "2026-10-06T09:15:00.000000Z",
  "url": "https://app.plane.so/acme/browse/WEB-42/"
}
```

## 9. Error handling (FR9; D10, D17)
An `afterResponse` middleware handles every response with status 400 or higher. It reads v1 error bodies, which come as `{"error": "…"}`, `{"detail": "…"}` or `{field: ["msg"]}`.

Plane's `APIKeyAuthentication` has no `authenticate_header`, so Django REST Framework (DRF) returns **403, not 401**, for a missing or invalid key (D17). The middleware therefore tells the two kinds of 403 apart by the `detail` text.

| Case | Thrown | User message |
|---|---|---|
| 400 | `Error` | "Plane rejected the request: {field}: {msg}; …" (or the `error`/`detail` text) |
| 401, or 403 with `detail` containing "token" or "credentials" | `ExpiredAuthError` (plain `Error` while `isTestingAuth`) | "Your Plane API key is invalid or was revoked. Create a new key under Profile settings → Personal Access Tokens and reconnect." |
| Auth test step 2: 403 or 404 | `Error` | "Workspace '{slug}' wasn't found, or you aren't a member. Check the slug in your Plane URL." |
| Other 403 | `Error` | "Your Plane account can't do this in this project. Ask a project admin to add you as a Member or Admin." |
| 404 (except `allow404`) | `Error` | "Plane couldn't find that project or work item. Check that you belong to the project. Self-hosted: make sure your Plane version supports the work-items API." |
| 429 | `ThrottledError` | "Plane's rate limit (60 requests/minute) was reached. Zapier will retry automatically." |
| 5xx | `Error` | "Plane returned a server error ({status}). Try again in a few minutes." |
| Network error or timeout (caught in `lib/client.js`) | `Error` | "Couldn't reach Plane at {base}. Check the Plane URL in your connection." |

Messages never include the API key or the request headers.

## 10. Decisions
| # | Decision | Source | Status |
|---|---|---|---|
| D1 | API v1 for every call (CE has no v2) | [v2 migration](https://developers.plane.so/api-reference/v2/migrating-from-v1) · [CE urls.py](https://github.com/makeplane/plane/blob/7466675e471efe1c96b122615f7a0d30c9b2eb05/apps/api/plane/urls.py) | Decided |
| D2 | `/work-items/` paths, not `/issues/` | [List work items](https://developers.plane.so/api-reference/issue/list-issues) | Decided |
| D3 | Custom auth: `X-API-Key` + slug + optional URL | [Plane API intro](https://developers.plane.so/api-reference/introduction) · [Zapier CLI](https://docs.zapier.com/platform/build-cli/overview) | Decided |
| D4 | Workspace set per connection (no list-workspaces endpoint in v1 or v2) | [Plane docs index](https://developers.plane.so/llms.txt) | Decided |
| D5 | Connection test = `users/me` + projects | [Current user](https://developers.plane.so/api-reference/user/get-current-user) | Decided |
| D6 | Trigger: 1 page, `-created_at`, 100 items, dedupe `id` | [List work items](https://developers.plane.so/api-reference/issue/list-issues) · [Zapier dedupe](https://docs.zapier.com/platform/build/deduplication) | Decided; T5b passed 2026-10-06 (API honours `order_by`; client-side sort kept as a guard) |
| D7 | Dropdowns follow `next_cursor`, at most 5 pages or 25 s | [Plane API intro](https://developers.plane.so/api-reference/introduction) | Decided; T12 passed 2026-10-06 (multi-page walk works) |
| D8 | Search: identifier route, then `/work-items/search/` with `limit=100`; exact match by default | [Search](https://developers.plane.so/api-reference/issue/search-issues) · [By identifier](https://developers.plane.so/api-reference/issue/get-issue-sequence-id) | Decided |
| D9 | Find or Create via `searchOrCreates` | [Zapier schema](https://github.com/zapier/zapier-platform/blob/main/packages/schema/docs/build/schema.md#searchorcreateschema) | Decided |
| D10 | Map errors in `afterResponse`; catch network errors in the client | [Zapier CLI](https://docs.zapier.com/platform/build-cli/overview) · [CE base.py](https://github.com/makeplane/plane/blob/7466675e471efe1c96b122615f7a0d30c9b2eb05/apps/api/plane/api/views/base.py) | Decided |
| D11 | 60/min budget; 429 → `ThrottledError` | [Plane API intro](https://developers.plane.so/api-reference/introduction) · [v2 errors](https://developers.plane.so/api-reference/v2/errors) | Decided |
| D12 | Description: plain text → escaped `description_html` | [Create work item](https://developers.plane.so/api-reference/issue/add-issue) | Decided |
| D13 | Web link `{web}/{slug}/browse/{IDENT}/` | [CE web route](https://github.com/makeplane/plane/tree/7466675e471efe1c96b122615f7a0d30c9b2eb05/apps/web/app/(all)/[workspaceSlug]/(projects)/browse) | Decided; T11 passed 2026-10-06 (manual check in the Zapier editor: `url` opened the work item). It can't be automated: app.plane.so returns 200 for any path |
| D14 | Plane URL must be HTTPS | PRD NFR3 | Decided |
| D15 | API use is allowed ("published APIs…", §2.5(g)) | [Plane terms](https://plane.so/legals/terms-and-conditions) | Decided |
| D16 | Move to API v2 | [v2 intro](https://developers.plane.so/api-reference/v2/introduction) | Deferred until CE serves `/api/v2/` |
| D17 | Bad key = 401 **or** 403 with an auth `detail`; wrong slug = 403/404 | [CE api_authentication.py](https://github.com/makeplane/plane/blob/7466675e471efe1c96b122615f7a0d30c9b2eb05/apps/api/plane/api/middleware/api_authentication.py) | Decided; T13 passed 2026-10-06 (Cloud: bad key → 403 "Given API token is not valid"; bad slug → 404 "Workspace not found.") |
| D18 | If the read-back after a create fails, return the POST body | — | Decided |
| D19 | Search requires a project, so Find or Create can't match across projects | — | Decided |
