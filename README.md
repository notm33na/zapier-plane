# Plane for Zapier

> **Unofficial.** This is a portfolio project. It is not affiliated with, endorsed by, or supported by Plane Software, Inc. "Plane" is their trademark.

## The problem
[Plane](https://plane.so) is a popular open-source project management tool, but there is no Plane app in the Zapier directory. Teams on Plane end up copying form responses, support emails and alerts into Plane by hand, and then announcing new work in Slack by hand too.

## What this integration does
It connects Plane Cloud or a self-hosted Plane instance to thousands of apps on Zapier with a personal API key.

| Type | Name | What it does |
|---|---|---|
| Trigger | **New Work Item** | Starts a Zap when a work item is created in a project you choose. |
| Action | **Create Work Item** | Creates a work item with title, description, priority, state and labels. |
| Search | **Find Work Item** | Finds a work item in a project by exact title or identifier (e.g. `WEB-42`). |
| Search or create | **Find or Create Work Item** | Finds a matching item in the chosen project, or creates it if none exists. |

Highlights: dropdowns for project, state and labels; clear error messages for bad keys, missing projects and rate limits; and it stays within Plane's 60 requests/minute limit.

## Example Zaps

**1. Typeform response → Create Plane work item**
A customer submits a bug report form, and a work item appears in the *Support* project with the answers in the description and the label `from-form`.

![Screenshot: Typeform to Plane Zap setup](docs/img/zap-typeform-to-plane.png)

**2. New Plane work item → Slack message**
Every new item in *Website* posts `New: WEB-42 Customer can't reset password (high)` with a link to `#web-team`.

![Screenshot: Plane to Slack Zap setup](docs/img/zap-plane-to-slack.png)

## How it's built
- Zapier Platform CLI (`zapier-platform` v19, Node 22). Plane REST API v1, `/work-items/` endpoints, chosen so self-hosted Community Edition works too ([decision log](docs/ARCHITECTURE.md#10-decisions)).
- Product spec: [docs/PRD.md](docs/PRD.md). Technical design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Connect your account
1. In Plane, open **Profile settings → Personal Access Tokens** and create a token.
2. In Zapier, add a Plane connection. Paste the token and your workspace slug (`acme` in `app.plane.so/acme/…`).
3. Self-hosted? Also enter your instance URL (HTTPS, reachable from the internet).

## Status
v1 is complete. Every trigger, action and search passes its unit tests and its live tests against Plane Cloud, and was checked by hand in the Zapier editor (October 2026). It is a private integration, not listed in the Zapier directory.
