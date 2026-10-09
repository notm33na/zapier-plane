# Deployment record

Date: 2026-10-09 · Run by: Claude (for notm33na) · Zapier app 247303 · Plane Cloud

Workspace slug, API key and account names are redacted (`<slug>`).

## What is deployed
| | |
|---|---|
| Zapier version | **1.0.0** (platform 19.1.0), state `private`, the only version. Pushed 2026-10-06 06:56 UTC, 1 Zap user |
| Distribution | Invite link: https://zapier.com/developer/public-invite/247303/43b831dc22d46ec496e2a0d5cc7c577d/ |
| Landing page | https://notm33na.github.io/zapier-plane/ (GitHub Pages, deployed from `site/` by `.github/workflows/pages.yml`) |

### No new push, promote or migrate
- **No push:** `index.js`, `authentication.js`, `lib/*`, `triggers/*`, `creates/*` and `searches/*` are byte-identical to the pushed `build/build.zip`. Only `package.json` differs: the `test` script and the `license` field, which don't affect runtime. So the version stays at 1.0.0.
- **No promote:** for a private integration, `zapier-platform promote` doesn't change which version the invite link serves. It opens Zapier's request to list the app publicly, which PRD §4 rules out ("Public listing in the Zapier directory" is a non-goal). Zapier also accepts public listings only from the service owner (Plane) or with its permission. Invite users already get 1.0.0, the only version.
- **No migrate:** there is no older version to move users from.

## Pre-flight
| Check | Result |
|---|---|
| `git status` clean, `main` matches `origin/main` (730ab3d) | PASS |
| `zapier-platform validate` | PASS: 0 errors, 15 checks passed, 2 general warnings (D026 `plane_url` field, handled by `resolveBases`; D027 core 19.2.0 available) |
| `zapier-platform test` / `npm test` | PASS: 6 suites, 100/100 |
| `npm run test:int` (live Plane Cloud) | PASS: 6/6 |
| zapier-code-reviewer | PASS: no High findings. 2 Medium findings logged for the next version (see Follow-ups) |

## Landing page
GitHub Pages had never been enabled, so the two earlier `pages` workflow runs failed at `configure-pages`. Pages was enabled with the workflow as its source, the workflow was re-run (success), and the repo homepage was set to the site URL.

| Check | Result |
|---|---|
| `/` | 200, `text/html` |
| `assets/demo.mp4` | 200, `video/mp4`, 5,103,303 bytes, SHA-256 identical to the repo file. `moov` is before `mdat`, so it streams |
| Poster and 3 screenshots | 200, `image/png` |
| "Try it in Zapier" link | Points to the invite URL above, which resolves (200) to Zapier's sign-in, then the invite |

## Live transaction
Ran the integration's own `perform` code, which is identical to deployed 1.0.0, with `zapier-platform-core`'s app tester against the real workspace, in project **TEST** (not the project the Slack Zap watches). This didn't go through the Zapier editor UI.

| Step | Result |
|---|---|
| Create Work Item (title, two-line description with `&` and `<b>`, priority medium) | PASS: **TEST-15** created in 1.7 s, `url` = `https://app.plane.so/<slug>/browse/TEST-15/` |
| Read back through the Plane API | PASS: title matches, priority `medium`, description stored as `<div><p>Post-deploy check.</p><p>Line two &amp; &lt;b&gt;escaped&lt;/b&gt;</p></div>` |
| Delete | PASS: DELETE 204, then GET 404 |

## Rollback
- **Zapier, after a later version is promoted:** `zapier-platform promote <previous version>`, then `zapier-platform migrate <bad version> <previous version>` to move existing users back. Check with `zapier-platform versions`.
- **Zapier, today:** 1.0.0 is the only version. To stop new sign-ups, revoke or regenerate the invite link in the Zapier developer platform (Sharing).
- **Landing page:** `git revert` the bad `site/` commit and push. The `pages` workflow redeploys it. To take the site down: `gh api -X DELETE repos/notm33na/zapier-plane/pages`.

## Follow-ups (from code review, not blocking)
- **M1** `lib/format.js:20-21`: `htmlToText` throws `RangeError` on an out-of-range numeric entity (e.g. `&#99999999;`). This could break trigger polls, or fail a create after the item already exists.
- **M2** `searches/find_work_item.js:48-76`: a query shaped like an identifier can make 3 sequential requests (up to 30 s). ARCHITECTURE says 2 × 10 s.
- D027: upgrade `zapier-platform-core` to 19.2.0.
