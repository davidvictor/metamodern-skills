# Verification and Closeout

## Select the applicable proof

Audit is read-only: inspect the requested code and live-resource seams, report exact drift and access limits, and do not create resources, deployments, synthetic submissions, or operations documentation.

For Set up, Extend, and Repair, run the local, preview, failure-recovery, and closeout sections that cover the changed seams. Run the Production gate only for an authorized production rollout. Do not manufacture unrelated test evidence.

## Local contract tests

Test behavior, not only successful HTTP calls.

### Storage and repository

- one valid form payload creates exactly one stored row and returns its unique ID;
- storage failure returns the current user-visible server error;
- provider failure after storage still returns the current success experience;
- claim limits, leases, retry timing, and delivery-state updates are exact;
- an already completed destination is not called again;
- errors and logs contain no contact values or secrets.

### Google Sheets

- exact field-to-column mapping;
- exact header match and header-drift rejection;
- existing submission ID returns already delivered;
- absent submission ID appends one raw row with `insertDataOption=OVERWRITE`;
- the append request never uses `INSERT_ROWS`;
- formula-like input remains a cell value;
- provider timeout and non-success response remain pending;
- tab names with punctuation are quoted correctly.

### Slack

- fallback text and Block Kit payload include project, form, UTC time, and submission ID;
- all user-controlled `&`, `<`, and `>` characters are escaped;
- long fields are truncated or split within current limits;
- 2xx with body `ok` succeeds;
- non-2xx and non-`ok` bodies remain pending;
- no per-message channel, username, or icon override is sent.

### Route and form regression

- missing cron configuration returns 500;
- missing or incorrect bearer token returns 401;
- a valid token processes only the bounded batch;
- form validation, honeypot, error restoration, confirmation, focus, redirect, and accessibility behavior remain unchanged;
- the full test suite and production build pass.

## Preview end-to-end proof

For a Set up, Extend, or Repair that changes delivery behavior, use isolated preview data and a controlled team inbox. Label every synthetic record clearly as a preview test.

1. Confirm the preview deployment is Ready and the form loads.
2. Confirm required variable names exist without printing values.
3. Submit one controlled payload.
4. Reconcile the same unique submission ID across the database, QA Sheet, and Slack.
5. Confirm both destination completion times are set and the error state is empty.
6. Confirm the Sheet contains no excluded technical fields.
7. Visually confirm the retained and newly appended Sheet rows have the intended data-row background, dark text, and normal font weight while all values remain unchanged.
8. Inspect the Slack message layout, app name, channel, and bot icon.
9. If a public icon URL is retained on Vercel, verify status, content type, dimensions, and caching path.

## Failure recovery proof

When a changed delivery path can leave either provider pending, test each provider independently with preview-scoped configuration.

### Google unavailable

Temporarily remove the preview service account from the QA Sheet or point Preview at a controlled inaccessible QA target. Submit one labeled record and verify:

- database storage and form success;
- exactly one Slack message;
- Google remains pending while Slack is complete;
- after restoring access, one retry creates exactly one Sheet row and does not send Slack again.

### Slack unavailable

Use a preview-only invalid webhook. Submit one labeled record and verify:

- database storage and form success;
- exactly one Google row;
- Slack remains pending while Google is complete;
- after restoring the webhook, one retry sends Slack and does not append Google again.

### Retry route and overlap

- unauthenticated requests are rejected;
- controlled preview calls prove the protected retry route accepts only the valid bearer token and processes its bounded batch;
- two overlapping invocations cannot claim the same row;
- logs contain IDs, destinations, counts, and sanitized error classes only.

Vercel Cron runs only on production deployments. Do not claim scheduled-invocation evidence from preview; defer production schedule visibility and scheduled-run proof to the authorized Production gate.

Restore every preview permission and variable immediately after its test and read it back. Do not make production inaccessible to simulate failure.

## Production gate

Run this gate only when the user authorized a production rollout. After preview evidence passes:

1. verify the exact production database, Sheet owner, Sheet ID, Slack workspace ID, channel ID, Slack app, Vercel project, and deployment commit;
2. apply only reviewed production schema changes;
3. verify the production deployment is Ready;
4. submit one internal production-labeled record;
5. reconcile its unique ID exactly once across database, production Sheet, and Slack;
6. inspect the production Sheet and confirm submission rows retain their intended data-row formatting instead of inheriting header formatting;
7. verify scheduled retry authorization and logs;
8. inspect the rendered bot icon and message;
9. remove only clearly labeled QA database and Sheet rows after evidence is retained. Do not promise webhook message deletion because incoming webhooks cannot delete posts.

## Closeout record

For Set up, Extend, or Repair, use the project's existing operations documentation. If none exists, create `docs/operations/form-delivery.md` with:

- architecture and canonical database;
- form types and field-to-destination contracts;
- database project reference and migration names;
- Google owner, Sheet title, ID, link, tab, and header contract;
- Google Cloud project number, workload identity pool and provider IDs, and service-account email;
- Slack workspace name and ID, channel name and ID, app name and ID, and configuration link;
- Figma icon source link, approved export path, and optional Vercel asset URL;
- Vercel team, project, environments, cron path, schedule, and env variable names;
- test commands, preview receipts, failure-recovery receipts, production submission ID, deployment URL, and deployment commit;
- any deliberate exception, owner, and review date.

Keep webhook URLs, database secrets, cron values, OIDC tokens, contact values, raw payloads, and signed provider URLs out of this record.

For Audit, return proposed operations-documentation changes without creating the file.
