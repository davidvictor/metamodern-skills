# Delivery Architecture

## Core invariant

The database accepts the submission first and is the only canonical record. Google Sheets and Slack are downstream delivery destinations. Provider failure must not erase the row, change a stored submission to failed, or tell a person to resubmit data already accepted.

## Reuse the project's database

- If the project already has a dedicated Payload/Postgres, Supabase, or equivalent database, extend that database.
- If the project has no database, create a dedicated Supabase project for the website.
- Keep database storage unique to the website project. Do not reuse another client's database and do not create a second permanent database beside the canonical one.
- For an existing submission collection, preserve its primary key and add delivery state on the row or in a destination table keyed to that row.

Use row-level destination columns for one form and two fixed destinations. Use a `submission_deliveries` table when the project has many forms, destinations, or delivery types. Both shapes must preserve one unique submission ID and one completion state per destination.

## Required state

At minimum retain:

- unique submission ID;
- UTC creation time;
- form type or slug;
- validated form fields needed by the project;
- source or campaign when the project collects it;
- Google completion time;
- Slack completion time;
- attempt count;
- next attempt time;
- lease expiry;
- sanitized per-destination error state.

Do not export `user_agent`, IP address, honeypot values, secrets, or raw provider responses to Google Sheets or Slack. Store only fields the project needs and has authority to collect.

## Claim and retry contract

- Claim at most 20 pending rows in one invocation unless current project limits justify less.
- Use an atomic database claim with `FOR UPDATE SKIP LOCKED` or an equivalent compare-and-set operation.
- Give each claim a short lease, normally two minutes, so overlapping functions do not work the same row.
- Call providers with an eight-second timeout unless current provider guidance requires a smaller limit.
- After a failure, use capped exponential backoff: `min(3600 seconds, 60 seconds * 2^(attempt - 1))`.
- Clear the lease after recording results. Set the next attempt to null only after every required destination is complete.
- Store a capped, sanitized error class or message. Never store contact values, webhook responses containing secrets, or authorization tokens.

When using Supabase, put privileged claim logic in a private schema when practical. If a `SECURITY DEFINER` function must be exposed through the Data API, set a safe `search_path`, revoke execute from `PUBLIC`, `anon`, and `authenticated`, grant only the server role, and run database advisors.

## Provider independence

Process Google and Slack independently, normally in parallel. Record both outcomes even when one fails.

- A non-null Google completion time means later retries skip Google.
- A non-null Slack completion time means later retries skip Slack.
- Google checks the destination for the unique submission ID before appending.
- Slack incoming webhooks have no idempotency key. The lease prevents ordinary duplicates, and the submission ID makes a rare ambiguous timeout duplicate recognizable.

## Application boundary

The form handler or server action must:

1. enforce the current validation and spam controls;
2. insert and return the stored row representation;
3. return a user-visible storage error only when canonical storage failed;
4. attempt immediate delivery after storage;
5. return success after storage even when a destination remains pending;
6. log only the submission ID, destination, status code, and sanitized error class.

Preserve error restoration, confirmation copy, focus behavior, accessibility, analytics, and redirects unless the user requested changes to those behaviors.

## Google implementation choice

Use the direct Google Sheets API with Vercel OIDC and Google Workload Identity Federation for new Vercel projects. It avoids long-lived service-account keys and supports narrow project and environment trust.

Use a bound Apps Script webhook only when the project already owns that pattern or Vercel OIDC is unavailable. The Apps Script must still authenticate requests, lock concurrent writes, validate headers, deduplicate by submission ID, and neutralize formula-like cell values. Database retry state remains required because Apps Script alone is not a delivery guarantee.
