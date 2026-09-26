# Web application profile

Use when the named task changes an application behavior, account, data, or authenticated workflow.

Inspect existing architecture, tenancy, authorization, data ownership, consumer boundaries, runtime, and local resources. Ask about personal versus team accounts, access/role behavior, authentication, data retention, payments, providers, and durable or AI work only when the task makes the choice material. Add durable Workflow behavior only when the task needs waits, retries, or idempotency. Include allowed and denied acceptance cases for changed access boundaries.

MakerKit is a likely foundation when the task needs accounts, authentication, and persistent data. Select it from current requirements and invoke `metamodern-bootstrap-app` with established decisions. Do not choose it merely because this is a web project. Existing applications retain their stack unless a supported task decision changes it. Vercel and Supabase are optional targets selected from the task's needs and current provider authority; do not provision either by default. Use current official or vendor tools and documentation for selected integrations instead of copying their manuals into project guidance.
