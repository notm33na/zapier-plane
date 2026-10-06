# PRD: Plane for Zapier (v1)

Status: Approved for build · Owner: notm33na · Last updated: 2026-10-06

## 1. Problem
Plane (plane.so) is an open-source project management tool with no app in the Zapier directory (checked 2026-10-06). Teams on Plane can't connect it to their other tools with Zapier. They re-type form submissions, support emails and alerts as work items by hand, and they announce new work items in chat by hand too.

## 2. Users
- **Primary:** ops leads, PMs and small engineering teams on Plane Cloud (including the Free plan) who already use Zapier.
- **Secondary:** teams that self-host Plane and can reach their instance over public HTTPS.

## 3. Goals and non-goals
**Goals**
- G1: Connect a Plane account (Cloud or self-hosted) with a personal API key in under 2 minutes.
- G2: Start Zaps when a work item is created, create work items from any app, and find a work item (or create it if it doesn't exist).
- G3: Show plain-language errors that tell the user what to fix.

**Non-goals (v1)**
- OAuth, Plane webhooks/instant triggers, and updating or deleting work items.
- Assignees, cycles, modules, custom properties, work item types, and attachments.
- Listing workspaces (no Plane API endpoint does this; see ARCHITECTURE D4).
- Public listing in the Zapier directory. v1 is a private, invite-only integration.

## 4. Functional requirements
| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR1 | **Connect account** with API key (required, hidden), workspace slug (required) and Plane URL (optional, default Plane Cloud). | Valid key + slug → connection saved. Bad key → "API key is invalid or was revoked". Wrong slug → "Workspace '…' wasn't found, or you aren't a member". Non-HTTPS URL → rejected before any request. |
| FR2 | **Connection label** shows who and where. | Label reads `<display name> (<workspace-slug>)`. |
| FR3 | **Project dropdown** for every trigger, action and search. | Lists every project the user can see as `Name (IDENT)`: up to 500, within 25 s. The value is the project UUID, and custom values are allowed. |
| FR4 | **New Work Item** polling trigger. | Fires once per new work item in the chosen project. Results are newest first and deduped by `id`. The test step returns real items, or the static sample when the project is empty. |
| FR5 | **Create Work Item** action: title (required), description, priority, state, labels. | Creates the item and returns it with `id`, `identifier` (e.g. `WEB-42`) and `url`. Title over 255 characters → clear error, no request sent. Description is stored as rich text, and line breaks are kept. |
| FR6 | **State and label dropdowns** depend on the selected project. | Show that project's states and labels, and reload when the project changes. Labels allow multiple values. |
| FR7 | **Find Work Item** in a required project, by title or identifier. | `WEB-42` style input resolves directly. If no such identifier exists, the text search runs instead. Title matching is exact (case-insensitive) by default, or "contains" when exact match is off. No match → Zapier "nothing found" (no error). Returns at most one item, in the same shape as FR5. |
| FR8 | **Find or Create** pairs FR7 with FR5. | Matches only in the chosen project. When there is no match, the item is created with the create fields. |
| FR9 | **Error mapping** for 400/401/403/404/429/5xx and network failures. | Each case shows the user message from ARCHITECTURE §9. 429 is retried by Zapier after the server's delay. |

## 5. Non-functional requirements
- **NFR1 Rate limits:** stay under Plane's 60 requests/minute per key. Steps use 1–3 requests, and a dropdown uses at most 5. No retry loops in code.
- **NFR2 Time:** every step finishes in under 30 s (Zapier limit). Requests time out at 10 s, and pagination stops at 25 s.
- **NFR3 Security:** the API key is sent only in the `X-API-Key` header over HTTPS. No secrets in the repo, logs, error messages or fixtures. `.env` is git-ignored.
- **NFR4 Compatibility:** Node 22, `zapier-platform-core` 19.x, Plane Cloud and self-hosted Community Edition (any release that serves `/api/v1/.../work-items/`).
- **NFR5 Quality:** `zapier-platform validate` has no errors, all unit tests pass, and every trigger, action and search has sample data, labels and help text.

## 6. Test list
Unit tests use mocked HTTP (nock). Integration tests (`INT`) run against a real **Free-plan** Plane Cloud workspace from `.env`.

| # | Test | Covers |
|---|---|---|
| T1 | Auth test succeeds and returns `display_name` + slug; label renders | FR1, FR2 |
| T2 | Bad key (401, and 403 with "Given API token is not valid") → key message. Slug 403/404 in the auth test → workspace message. Other 403 → permission message | FR1, FR9 |
| T3 | Normalisation. Plane URL: blank, trailing `/`, `/api`, `/api/v1`, `app.plane.so` and `api.plane.so` → Cloud bases; `http://` rejected. Slug: pasted URL, spaces and capitals → `acme` | FR1 |
| T4 | Dropdowns follow `next_cursor`, accept a plain array, and stop at 5 pages or 25 s | FR3, FR6 |
| T5 | Trigger sends `order_by=-created_at&per_page=100&expand=…`, returns items with `id`, flattens state, labels and identifier | FR4 |
| T5b | INT: create two items; the trigger's first result is the newer one. **Fallback if it fails:** client-side sort (already in place) | FR4 |
| T6 | Create sends `name`, escaped `description_html`, `priority`, `state`, `labels`. A title of 256 characters (emoji count as 1) throws before the request. A failed read-back still returns the POST result | FR5 |
| T7 | Search: identifier hit; identifier 404 falls through to text search ("COVID-19"); identifier in another project falls through; exact vs contains; no match → `[]` | FR7, FR8 |
| T8 | 400 bodies (`{"error"}`, `{"detail"}`, field dict) → readable message. 404, 5xx and network timeout → messages from ARCHITECTURE §9 | FR9 |
| T9 | 429 → ThrottledError, with the delay from `Retry-After`, else `X-RateLimit-Reset`, else 60 s | FR9, NFR1 |
| T10 | INT: connection test, list projects, create → find (by title and by identifier) → trigger sees the item; cleanup deletes it | FR1–FR8 |
| T11 | INT: the built `url` opens the work item in Plane (manual check, once). **Fallback if it fails:** remove `url` from outputs | FR5 |
| T12 | INT: with `per_page=2` and at least 3 labels in the test project, page 2 from `next_cursor` differs from page 1. **Fallback if it fails:** dropdowns load page 1 only | FR3 |
| T13 | INT: `/users/me/` with a bogus key, and projects with a bogus slug. Assert the status + `detail` match ARCHITECTURE D17 (fallback mapping already handles 401 and 403) | FR1, FR9 |

## 7. Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Plane retires v1 or changes its shape | Low (v2 docs say v1 "keeps working") | All HTTP goes through `lib/client.js`, so moving to v2 touches one module. Watch the Plane changelog. |
| Self-hosted instance not reachable from Zapier, or too old for `/work-items/` | Medium | Help text says the instance needs public HTTPS. The 404 message suggests upgrading Plane. |
| More than 100 new items in one project between polls are missed | Low | Zapier reads one page per poll. The trigger help text says so. |
| Find or Create misses an existing item (more than 100 title matches, or a project the user isn't a member of) and creates a duplicate | Low | Exact title match by default, identifier shortcut, search limited to the chosen project, `limit=100`. |
| User mixes up the web URL and the API URL | Medium | Both Cloud hosts map to the right bases, and help text gives examples. |
| Shared 60/min budget with the user's other scripts | Low | 1–3 requests per step; 429 is handed to Zapier's delayed retry. |
