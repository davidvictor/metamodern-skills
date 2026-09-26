# Slack Setup

## Workspace and channel

The target workspace must be named by current project authority or instruction. Verify both its visible name and workspace ID before creating resources.

1. Verify the visible workspace name and ID before creation.
2. Search for the project channel and Slack app before creating either.
3. Reuse the exact existing project channel when it is already canonical.
4. Otherwise create one private channel named `<project-slug>-contact` and record its channel ID.
5. For private channels, ensure the installing user is a member before authorizing the webhook.

A Slack connector authenticated to any workspace is not evidence that it is the named target workspace.

## One app per project

Create one project-specific Slack app with only the permissions required for an incoming webhook. Use the current Slack manifest UI or app settings and validate the configuration before installation.

Set:

- app name and bot display name to `<Project Name> Contact`;
- short description to `Posts verified website form submissions.`;
- incoming webhooks enabled;
- `incoming-webhook` bot scope;
- socket mode, event subscriptions, commands, and interactivity disabled unless the project separately requires them;
- organization-wide deployment disabled.

Install the app to the verified workspace and choose the exact project channel in the authorization screen. Record the app ID, workspace ID, channel ID, app configuration URL, and webhook environment variable name. Never record the webhook URL in Git or project documentation.

Use `SLACK_FORM_WEBHOOK_URL` for a new project. Preserve a well-established project-specific variable name when renaming it would add risk without value.

## Bot icon

The app icon is a client-facing visual artifact.

1. Use the accepted Brand System. If it is missing or insufficient, route through `metamodern-develop-brand` and `metamodern-explore-brand-expression` before final production artwork.
2. Keep the editable source in Figma.
3. Export a high-quality 512 by 512 PNG. Favor a simple illustration or mark, omit small text, and do not round corners because Slack applies its own mask.
4. Keep the approved export in the project at a stable, project-specific path. A versioned public Vercel path is useful for provenance and other message surfaces but is not how the incoming-webhook avatar is configured.
5. Upload the PNG in Slack app Basic Information under Display Information.
6. Read back the app profile and inspect a real channel message at small and large rendered sizes.

Incoming webhooks inherit channel, username, and icon from the associated Slack app. Do not send `icon_url`, `username`, or `channel` overrides and do not claim a Vercel-hosted image controls the webhook avatar.

## Message contract

Every message includes:

- plain-text fallback such as `New <Project> <Form> submission from <identity>`;
- Block Kit header naming the project and form;
- labeled non-empty fields;
- submitted time in UTC;
- unique submission ID in the context block;
- environment label for non-production messages.

Escape `&`, `<`, and `>` in every user-controlled value so a submission cannot create a mention or unintended link. Truncate fields to current Slack limits and split large field sets across section blocks. Exclude honeypot values, `user_agent`, IP address, secrets, raw JSON, and internal provider errors.

Treat delivery as successful only when Slack returns a 2xx response with body `ok`. Classify permanent configuration errors separately from transient failures so operators can repair invalid hooks instead of retrying forever.

Incoming webhooks do not return a message timestamp and cannot delete posted messages. Use a dedicated QA destination or a visible preview label instead of promising automated cleanup.

Current official guidance:

- [Sending messages with incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/)
- [Slack app manifest reference](https://docs.slack.dev/reference/app-manifest/)
- [Slack app design guidelines](https://api.slack.com/start/designing/guidelines)
