# Domain Language and Boundaries

Locate a rough statement by the kind of decision being made. Clarify uses this to classify existing intent; Expand uses it to choose relevant concepts and questions, without printing a work classification. A website request can be branding, product design, UI design, front-end engineering, back-end engineering, or several of these; the medium alone does not decide.

## Product and experience

| Work area | Use when the intent concerns |
| --- | --- |
| Product strategy | Audience, value, market position, product goals, prioritization, roadmap, or business outcomes |
| Product management | Requirements, sequencing, tradeoffs, scope, coordination, or release decisions |
| Product design | How a product should work for people: tasks, flows, behaviors, usability, and end-to-end experience |
| UX research | Learning from users, validating assumptions, usability testing, interviews, or behavioral evidence |
| Service design | An experience spanning people, processes, channels, and operational touchpoints |
| Information architecture | Content structure, hierarchy, navigation, labeling, grouping, and findability |
| Content design / UX writing | Interface language, instructions, errors, prompts, comprehension, and content hierarchy |
| UI design | Visual hierarchy, controls, states, spacing, typography, color, and screen-level presentation |
| Interaction design | Control behavior, feedback, state changes, transitions, and the feel of using an interface |
| Accessibility | Keyboard, screen-reader, semantic, contrast, motion, cognitive, or inclusive-use needs |
| Design systems | Reusable components, patterns, tokens, variables, consistency, and design-code alignment |

Useful distinctions:

- `UX` is not a synonym for every design decision. Use the narrower area when the statement supports it.
- `UI design` describes the interface's visual and interactive presentation; `front-end engineering` implements browser or client behavior.
- For digital products, `Product design` can include UX and UI; use it as the primary label when the thought concerns how the product works as an experience. For physical objects, use the furniture and physical-object distinctions below.
- `Information architecture` concerns structure and findability; `visual hierarchy` concerns perceived emphasis on a screen or composition.

## Furniture and physical objects

For furniture form, proportions, comfort, materials, joinery, upholstery, cabinetry, or production, read the [Furniture Design dictionary](domains/furniture-design.md). Furniture design concerns the piece; interior design and space planning concern its setting and arrangement. Physical product design is broader than the digital product and experience terms above.

## Software and systems

| Work area | Use when the intent concerns |
| --- | --- |
| Front-end engineering | Browser or app-client implementation, HTML, CSS, components, client state, responsiveness, accessibility implementation, or client performance |
| Back-end engineering | APIs, server-side business logic, data persistence, authentication, authorization, jobs, queues, or integrations |
| Full-stack engineering | One coherent change that materially includes both client and server behavior |
| Platform engineering / DevOps | Environments, deployment, CI/CD, infrastructure, runtime configuration, or developer platforms |
| Site reliability engineering | Availability, failure recovery, observability, incident response, capacity, or operational resilience |
| Security engineering | Threats, access control, secrets, privacy, abuse prevention, or security controls |
| Data engineering | Data ingestion, transformation, storage, lineage, orchestration, or analytical pipelines |
| Data / analytics | Metrics, measurement, reporting, analysis, experiments, or decision evidence |
| AI / ML engineering | Models, prompts, retrieval, agents, evaluations, training, inference, or model-integrated systems |

Useful distinctions:

- A visual change is not automatically front-end engineering; implementation details must be present or requested.
- Reliability can be a back-end concern, a platform concern, or both. Label the locus named by the user.
- "Save first, then deliver elsewhere" expresses durable persistence and decoupled downstream delivery. Do not prescribe a queue, database, or provider unless the user did.
- "Do not send it twice" expresses idempotent behavior or deduplication. Use the exact term only when it clarifies the requirement.

## Brand and visual communication

| Work area | Use when the intent concerns |
| --- | --- |
| Brand strategy | Positioning, audience, differentiation, promise, personality, meaning, or brand architecture |
| Verbal identity | Voice, tone, naming, messaging, vocabulary, taglines, or how the brand sounds |
| Visual identity | Logo, typography, color, imagery, composition, graphic devices, and rules that make the brand recognizable |
| Art direction | The overarching visual atmosphere and principles guiding imagery and execution across artifacts |
| Graphic design | Visual communication in posters, campaigns, editorial pieces, documents, packaging, or other composed artifacts |
| Editorial design | Publication structure, pacing, typographic hierarchy, grids, and long-form reading experience |
| Motion design | Time-based visual communication, animation language, transitions, and kinetic typography |
| Illustration / image-making | Authored imagery, image style, composition, rendering method, or visual metaphor |

Useful distinctions:

- `Branding` is the broader work of shaping meaning and recognition; `visual identity` is its visual system.
- A logo concern may be evidence of a wider visual-identity problem. Do not automatically expand it unless the user says the issue is broader.
- `Art direction` guides the visual world; `graphic design` composes a specific communication artifact within it.
- `Brand strategy` is not the same as marketing strategy. Strategy describes what the brand means and how it is positioned; marketing concerns reaching and converting audiences.

## Translation rules

Translate the idea, not just individual words:

| Rough expression | Possible precise language when context supports it |
| --- | --- |
| "It feels like a wall of stuff." | High information density, weak hierarchy, or excessive cognitive load |
| "Let people do some of it later." | Progressive disclosure, staged onboarding, or deferred setup |
| "Make it obvious what matters." | Stronger visual hierarchy, clearer prioritization, or explicit required/optional states |
| "It needs to work everywhere." | Cross-channel consistency or a system that adapts across the named contexts |
| "It looks like every tech startup." | Category sameness, generic visual conventions, or insufficient brand distinctiveness |
| "Do not lose the form if another tool is down." | Durable persistence before independent downstream delivery |
| "Try again without doing it twice." | Safe retries with idempotency or deduplication |
| "Make it feel faster." | Perceived performance, actual performance, reduced interaction cost, or fewer steps; keep the distinction open if unknown |

These are candidates, not automatic substitutions. Use only what the surrounding statement supports.

## Ambiguity boundary

Do not convert a perceptual judgment into a specific diagnosis without evidence:

- "Feels cheap" may concern typography, color, materials, imagery, motion, copy, or craft.
- "Make it pop" may mean emphasis, contrast, saturation, scale, novelty, or stronger hierarchy.
- "Simplify it" may mean fewer choices, fewer steps, clearer language, lower density, or a smaller technical system.
- "Make it modern" may concern current conventions, technical capability, cultural relevance, or visual style.

When the intended dimension is unclear but the statement is still usable, preserve the phrase and add a more precise hypothesis. Ask one concise question only when the unresolved dimension would materially change the pass-forward request.


## Questions that deepen the same subject

Use these only when developing prompt alternatives. Choose the question supported by the thought, not every question in a domain.

| Domain | Useful distinctions or connections to explore |
| --- | --- |
| Product and service | Desired progress vs interface tasks; first use vs continued use; individual touchpoint vs the whole service; user effort vs organizational convenience |
| Software and systems | Observable behavior vs implementation choice; correctness vs performance; local failure vs propagation; source of truth vs derived copies; consistency vs freshness |
| Data and AI | Measurement vs the thing measured; prediction vs explanation; model output vs verified evidence; retrieval vs training; automation vs delegated judgment |
| Brand and visual communication | Recognition vs sameness; category expectations vs distinction; intended meaning vs perceived meaning; system rules vs individual expression |

A technical term should not smuggle in a technical solution. For example, durable delivery does not select a queue provider, and knowledge retrieval does not establish that a vector database is needed.
