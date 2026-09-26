# Back-end and API Design Language

Use this dictionary when the intent concerns server-side operations, API contracts, business rules, permissions, persistence, integration, background work, failures, or compatibility. It helps describe required behavior without selecting an architecture, protocol, framework, provider, queue, database, or deployment model.

## Work areas and boundaries

| Work area | Use when the intent concerns |
| --- | --- |
| Back-end development | Server-side behavior, business logic, persistence, integrations, jobs, and operational failure handling |
| API design | The contract by which a client or service requests an operation and receives a result |
| Authentication | Establishing who or what is making a request |
| Authorization | Deciding what an actor may access or do, including anonymous actors |
| Domain and data modeling | Meaning, lifecycle, relationships, and invariants of business information |
| Platform / operations | Deployment, environments, runtime operation, and observability |

An API contract need not mirror database tables. A REST-style resource API is one option, not a default. A table-shaped API can be appropriate when the supplied context calls for it; name the desired interaction and constraints before selecting its form.

## Terms and distinctions

| Term | Meaning and useful distinction |
| --- | --- |
| Operation / resource | An action with an intended effect / an addressable representation of something; one does not require the other |
| Request / response | Information sent to seek an operation or representation / the returned result; both need relevant failure behavior |
| Contract | The expected inputs, outputs, errors, and compatibility expectations; distinct from implementation or storage |
| Authentication / authorization | Establishing identity / deciding permission; successful authentication does not grant an action |
| Validation / business rule | Whether supplied input is acceptable / a domain rule that must remain true; they may overlap but are not identical |
| Idempotency / deduplication | Repeating a request has the intended single effect / identifying and suppressing duplicates; similar aims with different mechanisms |
| Retry / recovery | Attempting an operation again / returning to a safe or useful condition after failure |
| Synchronous / asynchronous work | Work completed before a response / work completed later; neither determines delivery, reliability, or user feedback by itself |
| Concurrency | Multiple actions or processes overlapping in time; an apparent race condition does not identify the necessary control |
| Versioning / compatibility | Managing contract changes / allowing existing consumers to continue working; an added field may still affect consumers |
| Observability | Evidence from logs, metrics, traces, or related signals about runtime behavior; it is not the behavior itself |

## Translate the desired effect

| Rough expression | Possible precise language when context supports it |
| --- | --- |
| “Create an API for this screen.” | Define the operations, input, returned information, permission boundaries, visible states, and failure behavior the screen needs |
| “Only the right people should see it.” | Identify the relevant authorization rule; authentication alone may be insufficient |
| “Do not send it twice.” | A single intended effect across retries or duplicate requests; explore idempotency or deduplication without choosing a mechanism |
| “Save it before notifying anyone.” | Durable persistence before a separate downstream delivery; do not assume a queue or provider |
| “It needs to be real-time.” | Clarify whether the need is fresh reads, pushed notifications, collaboration, or prompt status feedback |
| “Handle failures gracefully.” | Identify the operation, failure, retry behavior, safe state, and user-visible result rather than promising generic resilience |
| “Keep the old clients working.” | State the compatibility boundary and behavior expected for existing consumers |
| “Make the endpoint secure.” | Clarify identity, authorization, validation, abuse controls, privacy, or transport concern; do not collapse them into one claim |

These are candidate meanings. Do not infer routes, HTTP methods, schemas, status codes, identity provider, storage, retry policy, service decomposition, or service-level target unless supplied.

## Questions for expansion

Choose useful competing angles from the actual seed:

- What operation does the user or system intend, and what information or state change should result?
- Who may make it, whose data can it affect, and what must remain unavailable?
- What is invalid input, what domain condition blocks the action, and how should each be represented to the caller?
- Can the request be repeated, overlap with another change, or complete later? What effect must remain true?
- Which change needs a compatible contract, durable record, background follow-up, or observable evidence?

Keep architectural style, endpoint shape, transport, auth provider, data store, job system, deployment, performance targets, and monitoring vendor open unless stated.

## Cross-domain links

Connect a UI interaction to the operation it requests, the business rule that governs it, the data change that records it, and the feedback the client shows. This map is optional and should not turn a small request into a systems-design exercise. Read [Domain and Data Modeling](domain-and-data-modeling.md) when the operation's nouns, ownership, lifecycle, or invariants are uncertain; read [Front-end Development](front-end-development.md) when the client behavior is the open problem.

## Primary sources

Consulted 2026-09-26 for stable concepts: [Microsoft, API design](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design); [RFC 9110, HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html); [OpenAPI Specification](https://spec.openapis.org/oas/).
