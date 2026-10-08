# Smoke test: live integration

Date: 2026-10-08 · Run by: Claude (for notm33na) · Zapier app 247303, version 1.0.0 · Plane Cloud

Workspace slug, API key and account names are redacted (`<slug>`). This was a smoke test only: no code was changed. Fixes are proposed at the end.

## Summary
| # | Check | Result |
|---|---|---|
| 1 | Pushed version matches the repo | **PASS** |
| 2 | Live Create Work Item → verified in Plane → Find Work Item | **PASS** |
| 3 | Live Zap "New Plane work item → Slack" | **PASS** (confirmed by owner in Slack and Zap history) |
| 4 | README demo video resolves and plays from GitHub | **PASS** (inline playback confirmed by owner) |
| 5 | Test items deleted | **PASS** (the Zap-check item is kept on purpose) |

## 1. Pushed version vs repo: PASS
- `zapier-platform versions`: one version, **1.0.0**, platform 19.1.0, state `private`, pushed 2026-10-06 06:56 UTC.
- `build/build.zip` (made by that push, same timestamp) unzipped and compared file by file with `main`. `index.js`, `authentication.js`, `lib/*`, `creates/*`, `searches/*` and `triggers/*` are **identical**.
- The only difference is `package.json`: the `test` script gained `--runInBand`, and a `license` field was added (commits 688c50a and 3289b04). Neither affects runtime, so no push is needed.
- `zapier-platform validate`: no errors. 15 checks passed, 0 publishing warnings, 2 general warnings (D026, D027; see Proposed fixes).
- `npm test`: 6 suites, **100/100 passed**.

## 2. Live transaction: PASS
Run with the integration's own `perform` functions through `zapier-platform-core`'s app tester (the live test harness), using the credentials in `.env`. It ran in project **TEST**, not the project the Zap watches, so it couldn't post to Slack. A temporary label was created for it and deleted afterwards.

**Create Work Item** input: title `smoke-muzu9f7s Smoke test café ✓`, a two-line description containing `&` and `<b>`, priority `high`, state `In Progress`, one label. It created **TEST-11** in 1.4 s.

| Check (read back independently through the Plane API) | Result |
|---|---|
| Title, including non-ASCII characters | PASS |
| Description stored as escaped rich text, line breaks kept | PASS. Stored as `<div><p>Line one &amp; &lt;b&gt;not bold&lt;/b&gt;</p><p>Line two</p></div>`. Plane adds the outer `<div>`. `description_text` round-trips exactly. |
| Priority = high | PASS |
| State = In Progress | PASS |
| Labels = the one temp label | PASS |
| `identifier` = project identifier + sequence (`TEST-11`) | PASS |
| `url` well formed: `https://app.plane.so/<slug>/browse/TEST-11/` | PASS (matches `^https://app\.plane\.so/[a-z0-9-]+/browse/[A-Z0-9]+-\d+/$`; returns HTTP 200, but app.plane.so returns 200 for any path, see D13) |
| Plane's identifier route resolves to the same item | PASS |

**Find Work Item** on that item:

| Query | Result |
|---|---|
| `TEST-11` (identifier) | PASS: the one item |
| `test-11` (identifier, lowercase) | PASS |
| Exact title | PASS |
| Exact title in upper case | PASS (case-insensitive) |
| Run ID only, exact match off ("contains") | PASS |
| Title that doesn't exist | PASS: `[]` (Find or Create would create here) |

Cleanup: TEST-11 and the temp label were deleted. A GET on the item then returned **404**.

## 3. Live Zap: PASS
The Zap watches project **MSMAN**, which holds every earlier Zapier and demo item. One item was created there **directly through the Plane API** (not through Zapier):

| | |
|---|---|
| Identifier | **MSMAN-14** |
| ID | `e41d942e-7fc3-47ba-aaf9-b640d4522c8b` |
| Title | `Smoke test 2026-10-08: Zap check (safe to delete)` |
| Priority | low |
| Created | **2026-10-08 17:57:27 UTC** (22:57 PKT) |

Run locally, the trigger's own code returns MSMAN-14 as the first (newest) result, so the next poll should pick it up.

**What to check** (the free plan polls every 15 minutes, so allow until about **18:13 UTC / 23:13 PKT**; one missed poll could stretch that to about 18:28 UTC):
1. **Slack:** a new message for **MSMAN-14** with the title above. The link should open `https://app.plane.so/<slug>/browse/MSMAN-14/`.
2. **Zapier → Zap history:** one run of the "New Plane work item → Slack" Zap after 17:57 UTC, status **Success**, with MSMAN-14 in the trigger data. There should be exactly one run for it. A second run for the same item would mean dedupe failed.
3. If nothing appears: check that the Zap is **On** and that its trigger project is MSMAN.

**Result (owner check, 2026-10-08): PASS.** The Slack message and the Zap history run both appeared for MSMAN-14.

Then delete MSMAN-14 in Plane, or ask Claude to delete it.

## 4. Demo video: PASS
| Link (from README) | Result |
|---|---|
| Thumbnail `docs/img/demo-thumbnail.png` | 200, `image/png` |
| Video link `docs/demo.mp4` → `github.com/notm33na/zapier-plane/blob/main/docs/demo.mp4` | 200 |
| Raw file (`raw.githubusercontent.com/.../docs/demo.mp4`) | 200, 5,103,303 bytes, **SHA-256 identical** to the local file |
| Plays? | `ffprobe`: H.264 1920×1080 + AAC, 2 min 2 s. A full `ffmpeg` decode finished with no errors. `moov` comes before `mdat`, so it can stream. |

GitHub serves the raw file as `application/octet-stream`, so the "raw" link downloads the file rather than playing it in the page. The README thumbnail goes to the blob page, where the owner confirmed the video plays.

### Note for IT: demo video hosting
- **Currently hosted in the repo** at `docs/demo.mp4` (5.1 MB, the redacted cut). The README thumbnail links to it on GitHub.
- **Question: where is its final hosting location?** Options: **YouTube** (unlisted), **Loom**, or **the M&S site**. Once decided, we will change the thumbnail link in `README.md` to the new URL, and can then remove `docs/demo.mp4` from the repo.

## 5. Cleanup: PASS
| Item | Status |
|---|---|
| TEST-11 (step 2) | Deleted (404 confirmed) |
| Temp label `smoke-muzu9f7s-label` (step 2) | Deleted |
| **MSMAN-14** `e41d942e-7fc3-47ba-aaf9-b640d4522c8b` (step 3) | **Kept for the Zap check. Delete after checking.** |

## Proposed fixes
Reviewed by the owner on 2026-10-08: none will be applied.
