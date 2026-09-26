# Domain and Data Modeling Language

Use this dictionary when the thought concerns what information means: shared terms, entities, identity, relationships, ownership, lifecycle, invariants, history, or derived information. It supports a prompt about the model without assuming domain-driven design, microservices, an event architecture, a relational database, or a specific storage system.

## Work areas and boundaries

| Work area | Use when the intent concerns |
| --- | --- |
| Domain modeling | The language, concepts, rules, and relationships that describe the business or system |
| Conceptual data model | The relevant things and relationships, independent of implementation |
| Logical data model | The structures and constraints needed to represent the concepts in a chosen broad data approach |
| Physical data model | Concrete tables, fields, indexes, documents, or storage details for a particular system |
| API design | Interactions and representations offered to consumers; an API does not need to copy the storage model |
| Analytics / data engineering | Measurement, transformed data, pipelines, lineage, and decision-oriented information |

Start with the user or business meaning before selecting storage. A conceptual model may be sufficient for one request; a physical model is useful only when implementation decisions are actually in scope.

## Terms and distinctions

| Term | Meaning and useful distinction |
| --- | --- |
| Entity / value object | In DDD-style modeling, an object tracked by identity through change / a concept defined by its attribute values rather than identity; use this distinction only when helpful, without requiring DDD |
| Identity / identifier | What makes something the same across time / a value used to refer to it; an ID field is not automatically the whole identity rule |
| Attribute / relationship | A property of a thing / a connection between things; a foreign key is one physical expression of a relationship |
| Cardinality / optionality | How many related things may occur / whether a relation or value is required; neither defines ownership |
| Ownership / access | Who is responsible for a record or change / who may read or act on it; ownership and authorization are distinct |
| Lifecycle / state | Meaningful transitions over time / a current recognized condition; names alone do not define permitted transitions |
| Invariant / validation | A rule that must remain true / a check on supplied or stored data; enforcement location remains a design decision |
| Transaction / event | An all-or-nothing change boundary / a recorded occurrence; a transaction can produce events, but they are not synonyms |
| Source of truth / derived data / cache | The authoritative record for a fact / data computed or copied from another source / a temporary copy optimized for access; each has different freshness and correction behavior |
| Audit history / version / operational log | A record of actions or changes / successive content or state versions / runtime diagnostic output; “keep history” may mean any of these |
| Missing / null / zero | Not available or not supplied / an explicit empty or unknown representation where allowed / a measured or asserted quantity of none; never silently collapse them |

## Translate the desired effect

| Rough expression | Possible precise language when context supports it |
| --- | --- |
| “We need a data model for this.” | Identify the concepts, identities, relationships, lifecycle, rules, and unresolved storage decisions |
| “Keep the history.” | Clarify whether the need is auditability, versions, business events, analytics, or operational diagnosis |
| “This number is not there yet.” | Distinguish unavailable, unknown, not applicable, null, and zero before choosing representation |
| “There should only be one.” | A uniqueness, cardinality, ownership, or lifecycle constraint; preserve which one is intended |
| “The app and report disagree.” | Identify source of truth, derived data, freshness, transformation, or measurement-definition differences |
| “A user owns it.” | A creator or responsible party, an access relationship, an administrative scope, or a business owner; do not infer authorization |
| “It is deleted but we need to keep it.” | A lifecycle, retention, audit, visibility, or recovery question; do not prescribe soft deletion |
| “Track changes over time.” | Versioning, event history, audit records, or time-series measurement; keep the purpose open |

These are candidate readings. Do not infer schema names, primary-key format, normalization level, tables, foreign keys, event store, retention period, or migration plan unless supplied.

## Questions for expansion

Use only questions that reveal a meaningful alternative:

- What are the core concepts, and which words need a shared definition before a model can be useful?
- What makes each relevant thing the same across time, and which relationships are optional, one-to-one, one-to-many, or many-to-many?
- What lifecycle changes are meaningful, who can make them, and which rules must remain true through change?
- Which information is authoritative, derived, cached, measured, unavailable, or explicitly zero?
- Is the need operational behavior, a consumer-facing API, historical truth, reporting, or storage implementation?

Keep database type, service boundaries, query language, normalization, eventing, retention, migration strategy, and performance targets open unless stated.

## Cross-domain links

Use the optional path user workflow → UI state → API operation → business rule → data change → visible feedback to connect a modeled concept to an experience. It can surface a missing definition without requiring every layer. Read [Back-end and API Design](back-end-and-api-design.md) for interaction contracts and permission-aware operations; read [Front-end Development](front-end-development.md) or [UI Design](ui-design.md) when the question is how a model appears or is changed by a person.

## Primary sources

Consulted 2026-09-26 for stable concepts: [Microsoft, domain analysis](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis); [PostgreSQL 17, constraints](https://www.postgresql.org/docs/17/ddl-constraints.html).
