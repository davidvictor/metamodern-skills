# Front-end Development Language

Use this dictionary when the intent concerns implementation in a browser or app client: semantic structure, layout, components, client state, forms, data display, responsiveness, accessibility implementation, or client performance. It supplies distinctions for a prompt; it does not select a framework, component library, rendering strategy, or hosting model.

## Work areas and boundaries

| Work area | Use when the intent concerns |
| --- | --- |
| UI and interaction design | What people see, understand, and do |
| Front-end development | How client code and browser capabilities implement that behavior |
| Accessibility implementation | Semantics, keyboard operation, labels, focus, and other accessible behavior in the client |
| Back-end and API design | Server operations, contracts, permissions, and persistence behind the interface |
| Design systems | Shared patterns, components, and tokens across products or surfaces |

A mockup is not a behavior specification, and a working client is not evidence that the experience is comprehensible or accessible. Native HTML elements include semantics and behavior; assigning an ARIA role does not itself create expected keyboard interaction.

## Terms and distinctions

| Term | Meaning and useful distinction |
| --- | --- |
| Semantic HTML | Elements that convey their role and structure to browsers and assistive technology; distinct from visual styling |
| Component | A reusable unit of interface behavior or presentation; it need not be universally reusable or part of a design system |
| Layout / responsive behavior | Arrangement in one available space / adaptation across relevant spaces and input conditions |
| Client state / server state | State controlled locally by the client / data or state represented by a remote system; a displayed value may involve both |
| Controlled input / validation | An input managed by application state / checks that identify or prevent invalid values; neither defines the error experience alone |
| Optimistic update / confirmed result | A displayed change before server confirmation / a displayed outcome after a relevant confirmation; choose only when supported by the desired behavior |
| Loading / skeleton / empty state | Pending data / a placeholder that suggests layout / an available view with no relevant items |
| Rendering / hydration | Producing visible UI / attaching client behavior to pre-rendered UI; do not introduce either unless architecture is relevant |
| Bundle / runtime performance | Code delivered to a client / behavior while it runs; “fast” does not identify either |
| Keyboard focus | The current receiver of keyboard input; distinct from visual selection or hover |

## Translate the desired effect

| Rough expression | Possible precise language when context supports it |
| --- | --- |
| “Build this screen.” | Implement the named visual structure and the stated behaviors, including relevant states rather than only the happy path |
| “Make it work on mobile.” | Define adaptation for the relevant space, order, controls, and input; do not assume a device or breakpoint |
| “The form is frustrating.” | Examine labels, input behavior, validation timing, errors, recovery, and submission feedback |
| “It flashes while loading.” | A loading transition, rendering, data-fetching, or layout-stability concern; retain the observed behavior |
| “Keep it in sync.” | Clarify which client state, server state, visible result, or invalidation behavior must agree |
| “It looks right but does not work with a keyboard.” | Keyboard operation, focus order, semantics, or control behavior may be incomplete |
| “Make it faster.” | Initial loading, visible rendering, interaction response, data wait, or perceived progress; keep the performance dimension open |
| “Use the same component everywhere.” | Shared presentation, shared interaction, shared API, or a design-system pattern; preserve which sameness is intended |

These are possible readings, not implementation instructions. Do not infer a framework, CSS method, state library, endpoint, cache policy, or target metric unless stated.

## Questions for expansion

Choose a small number of angles that genuinely differ:

- What must be present in the first usable view, and which states must the client make legible?
- Is the concern structural markup, visual layout, interaction behavior, client data, form recovery, or client performance?
- What needs to adapt when space, input method, connectivity, or data availability changes?
- Which behavior belongs in the client, and which depends on an API or business rule?
- What is the relevant evidence of completion: a visible state, keyboard path, responsive behavior, or an end-to-end result?

Keep browser support, devices, component boundaries, rendering model, design-system adoption, performance budgets, and test tooling open unless supplied.

## Cross-domain links

Read [UI Design](ui-design.md) for the task, hierarchy, and state the implementation must communicate. Read [Back-end and API Design](back-end-and-api-design.md) when the client invokes an operation or needs permission-aware data. Read [Domain and Data Modeling](domain-and-data-modeling.md) when displayed fields, lifecycle states, or source-of-truth rules are unclear. Interface text belongs to UI/content design; proposition-led or campaign copy belongs to copywriting.

## Primary sources

Consulted 2026-09-26 for stable concepts: [MDN, HTML and accessibility](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility/HTML); [web.dev, responsive design basics](https://web.dev/articles/responsive-web-design-basics); [W3C ARIA Authoring Practices, read me first](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/).
