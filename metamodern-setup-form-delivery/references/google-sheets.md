# Google Sheets Setup

## Account and ownership

The canonical Sheet owner must be named by current project authority or instruction. Do not create the Sheet until that owner is known.

1. Read the active Google profile before creation.
2. If the profile is not the named owner, switch to the specified account or use the approved profile. Do not create the Sheet under the connected account and transfer it later as a workaround.
3. Search by project name and form purpose before creating a file.
4. Create the Sheet in an existing project folder when one is already authoritative. Otherwise keep it in the named owner's Drive without inventing a new storage hierarchy.
5. Read back ownership, file ID, title, parents, permissions, and URL.

Share specific people as editors only when the project requires it. Do not share the parent folder, all of Drive, or a whole domain unless the user explicitly requests that scope.

## Workbook contract

Default title: `<Project Name> - Form Submissions`.

Default visible tab: `Submissions`.

- Freeze row 1.
- Enable a filter over the actual header range.
- Give row 1 the intended header styling only.
- Keep submission rows on a white background with dark, normal-weight text unless the project's accepted Sheet design specifies another data-row style.
- Keep the first column as the unique submission ID and the second as submitted time in UTC.
- Follow with the project-approved operational fields and a final source or form-type column when needed.
- Do not include `user_agent`, IP address, provider errors, secrets, or raw JSON by default.
- Validate exact headers before every write. Header drift stops delivery instead of shifting values into the wrong columns.

For projects with several form types or normalization rules, use a hidden ingestion tab with a stable machine schema and a visible `Submissions` view with human-friendly columns. The database remains canonical, so the ingestion tab should not become a second raw-data archive.

## Direct Sheets API on Vercel

Use Google Workload Identity Federation instead of a service-account private key.

1. Enable Google Sheets API, Security Token Service API, IAM API, and IAM Service Account Credentials API in the selected Google Cloud project.
2. Use one workload identity provider for a verified Vercel team issuer. Create a different provider when the Vercel team issuer differs.
3. Use the provider resource URL as the audience and map `google.subject` from `assertion.sub`.
4. Create a single-purpose service account for the website and environment with no broad project data role.
5. Grant `roles/iam.workloadIdentityUser` only to the exact Vercel subject, such as `owner:<team>:project:<project>:environment:production`. Do not grant the whole workload identity pool.
6. Share only the target Sheet with the service account as Editor.
7. Use the `spreadsheets` OAuth scope in the server-side Google auth client.

Prefer a separate preview service account and QA Sheet bound to the exact preview subject. Production and preview must not share database or Sheet credentials by default.

Required Vercel variable names for the direct path:

- `GCP_PROJECT_NUMBER`
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `GCP_WORKLOAD_IDENTITY_POOL_ID`
- `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_TAB`

Vercel injects `VERCEL_OIDC_TOKEN`; do not create a stored replacement.

## Append contract

- Read the fixed header row and the existing submission ID column in one bounded request.
- Compare headers exactly.
- Return already delivered when the submission ID exists.
- Append one row with `valueInputOption=RAW` and `insertDataOption=OVERWRITE` when the ID is absent. Do not use `INSERT_ROWS`: inserting a row beside the header can copy header formatting into the new submission row.
- Treat append mode as a regression-tested interface. A future refactor must preserve `OVERWRITE` unless the Sheet layout is redesigned and visually reverified.
- Quote A1 tab names correctly and test names containing spaces, punctuation, and apostrophes.
- Keep mapping code explicit and tested. Do not derive column order from object key order.

If using Apps Script, store the shared secret in Script Properties, not source. Use a script lock, exact headers, submission-ID deduplication, safe cell conversion, and a JSON `{ ok: true }` response only after the row is confirmed.

## Security and verification

- Use `RAW` input for the direct API path.
- In Apps Script, prefix values that could be interpreted as formulas before `setValues`.
- Never place the service-account email or a secret in a public form response.
- Verify the service account cannot access unrelated Sheets.
- Read the final metadata and header row after setup.
- Visually inspect an existing retained submission row and a newly appended row. Confirm values are unchanged and both rows use the intended data-row background, text color, and normal font weight rather than the header style.

Current official guidance:

- [Vercel OIDC for Google Cloud](https://vercel.com/docs/oidc/gcp)
- [Google Workload Identity Federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation)
- [Google Workload Identity Federation best practices](https://docs.cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation)
- [Google Sheets values append](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append)
- [Apps Script web apps](https://developers.google.com/apps-script/guides/web)
