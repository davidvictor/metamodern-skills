# Vercel and Database

## Database setup

Use the current project database when it is already dedicated and canonical. When the website has none, create a dedicated Supabase project named for the website. Record the project reference and console link, but never the database password or server secret.

For Supabase:

- create schema changes through the project's migration path;
- enable RLS on tables in exposed schemas;
- grant no browser role access when submissions are written through a server-only handler;
- keep service-role or secret keys server-only and outside `NEXT_PUBLIC_` variables;
- use a preview branch or approved clone for schema-risky tests;
- recheck row counts before backfilling delivery state;
- run database advisors and verify `anon` and `authenticated` cannot read contact rows.

When existing rows were already sent to Slack or Sheets, mark that destination complete before enabling retries. Never infer historical completion from code alone; inspect live destination and row evidence.

## Vercel project and environments

Resolve the exact Vercel team and project before adding variables or deploying. Confirm the current plan supports the chosen cron interval. Vercel Cron runs only on production deployments.

For a new project, use these server-only variable names where applicable:

- database URL and server secret names required by the incumbent adapter;
- `SLACK_FORM_WEBHOOK_URL`;
- the Google variables listed in [Google Sheets Setup](google-sheets.md);
- `CRON_SECRET` with at least 32 random bytes.

Commit empty variable names and explanations in `.env.example`. Store values as sensitive Vercel variables. Audit Production, Preview, and Development separately.

- Production points to the production database, Sheet, Google service account, and Slack channel.
- Preview points to isolated database state and a QA Sheet. Use a preview-specific Slack webhook or include a clear preview label.
- Development uses mocks by default. Pull live variables only for an intentional integration test, and remember that local Vercel OIDC tokens expire.

Do not give Preview production database or Sheet access by default. Use exact branch or environment subjects in Google Workload Identity Federation.

## Retry route

Use a Node.js server route for the delivery sweep. Keep the route dynamic and bounded.

- Require `Authorization: Bearer <CRON_SECRET>`.
- Return 500 when the secret is missing, 401 when it is wrong, and a sanitized result for a valid run.
- Process a bounded batch and let the database lease prevent overlap.
- Do not accept query parameters that widen the batch or expose submission data.
- Log counts plus submission IDs and destinations only.
- Add the route for preview verification. Add its `vercel.json` schedule using the current five-field cron syntax only when an authorized production rollout includes scheduled retries.
- Confirm the schedule is visible after a production deployment and trigger one controlled scheduled run through the supported Vercel path. Preview verification uses controlled protected-route calls and does not prove a production schedule.

## Public bot asset on Vercel

The approved Slack icon export may be kept under a stable public asset path when the project wants a public canonical copy.

- Use an immutable or versioned filename when replacing a cached image.
- Verify the deployed URL returns 200, the expected image content type, and the expected pixel dimensions.
- Keep the asset small and do not expose source files, credentials, or private brand material.
- Upload the same file to Slack Display Information. The public URL does not set the incoming-webhook avatar.

## Deployment order

Use this sequence only for an authorized production rollout. Preview-only implementation or repair stops after the relevant preview evidence.

1. Verify migration and adapters locally with mocks.
2. Apply schema changes to isolated preview data.
3. Configure preview-scoped variables and OIDC trust.
4. Deploy preview and complete the full verification matrix.
5. Apply the reviewed production migration.
6. configure production-scoped variables without printing values;
7. deploy or promote through the repository's normal production flow;
8. verify production route, cron, database, Sheet, Slack, and icon;
9. remove temporary preview resources only after production evidence is recorded.

Current official guidance:

- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel OIDC for Google Cloud](https://vercel.com/docs/oidc/gcp)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
