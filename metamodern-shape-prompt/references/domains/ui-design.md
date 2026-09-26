# UI Design Language

Use this dictionary when the thought concerns a digital interface's visual hierarchy, controls, states, navigation, feedback, or accessibility. It supports precise prompt shaping; it does not turn a visual preference into a prescribed component library, design system, or implementation plan.

## Work areas and boundaries

| Work area | Use when the intent concerns |
| --- | --- |
| UI design | Screen-level hierarchy, layout, controls, typography, color, spacing, and states |
| Interaction design | What a control does, feedback, transitions, input, and state changes |
| Information architecture | Content structure, labeling, grouping, navigation, and findability |
| Content design / UX writing | Interface labels, instructions, errors, and comprehension |
| Accessibility | Inclusive operation through keyboard, screen reader, visual, motion, and cognitive considerations |
| Front-end development | Implementing the browser or client behavior described by the design |

UI design describes the experience presented on screen. Front-end development makes it work in a client. Interface copy helps people complete a task; persuasive copywriting concerns a proposition and response. A request may cross these areas, but a screen request alone does not establish all of them.

## Terms and distinctions

| Term | Meaning and useful distinction |
| --- | --- |
| Visual hierarchy | The relative emphasis that helps a person notice and understand what matters; distinct from content order or navigation structure |
| Information density | The amount of material presented in a given view; reducing density is not automatically removing features |
| Grouping / proximity | How placement communicates relatedness; visual closeness does not establish a workflow relationship |
| Affordance / signifier | What an object appears to allow / the cue that communicates how to use it |
| Navigation / wayfinding | Moving among product areas / understanding where one is and how to proceed |
| Progressive disclosure | Deferring detail or choices until useful; distinct from hiding required information |
| System status / feedback | Acknowledgement of a current condition or action; a spinner alone may not explain progress or recovery |
| Empty / loading / error / success state | A condition with no content / pending information / a failed action or retrieval / a completed action; none implies the others |
| Validation / error recovery | Helping prevent or identify an input problem / helping a person correct it and continue |
| Focus / selected / disabled | Keyboard target / current choice or location / unavailable action; these states communicate different things |
| Responsive design | Adaptation to available space and input conditions; it does not promise identical layouts across devices |
| Accessibility | Whether people can perceive, understand, and operate the experience; a visual style or component name does not establish it |

## Translate the desired effect

| Rough expression | Possible precise language when context supports it |
| --- | --- |
| “Make it obvious what matters.” | Strengthen visual hierarchy, clarify the primary action, or distinguish required from optional information |
| “It feels like a wall of stuff.” | Lower information density, improve grouping, or introduce progressive disclosure |
| “Make it simpler.” | Fewer choices, fewer steps, clearer labels, lower density, or a more legible hierarchy; retain the uncertain dimension |
| “People should know what happened.” | Show useful feedback for the relevant state, action, or result |
| “It should work for everyone.” | Identify relevant accessibility and input needs; do not imply conformance without criteria and verification |
| “Make it feel faster.” | Improve perceived progress, interaction response, loading behavior, or task length; keep the cause open |
| “This control does not look clickable.” | Strengthen its signifier or clarify its role; do not assume a button is the right control |
| “The mobile version is broken.” | A problem with space, order, input, content priority, or a specific state; preserve the observed failure |

These are candidate meanings, not automatic substitutions. Do not infer exact breakpoints, colors, components, WCAG level, or device support from a rough expression.

## Questions for expansion

Choose questions that open distinct directions from the seed. A dense dashboard may invite an exploration of prioritization, navigation, or state feedback; those are separate hypotheses, not sequential phases.

- What must the person understand, decide, or complete in this moment?
- Which content is essential now, and which is useful only after a choice or action?
- Does the difficulty concern visibility, comprehension, control behavior, feedback, recovery, or access?
- Which named state matters: first use, loading, empty, error, success, selected, or return use?
- Does the interface need to adapt for a particular space, input method, assistive technology, or operating context?

Keep user groups, screen sizes, devices, component systems, contrast targets, interaction patterns, and acceptance criteria open unless supplied. A familiar pattern can support recognition without proving that it fits the actual task.

## Cross-domain links

A useful chain can be: user task → interface state → API operation → business rule → data change → visible feedback. It is a way to locate a concern, not a mandatory specification. Read [Front-end Development](front-end-development.md) when implementation is at issue, Back-end and API Design when the interface needs a server operation, and Domain and Data Modeling when the meaning or lifecycle of the information is uncertain.

## Primary sources

Consulted 2026-09-26 for stable concepts: [Nielsen Norman Group, Ten Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/); [W3C, WCAG 2.2](https://www.w3.org/TR/WCAG22/); [GOV.UK Design System, accessibility strategy](https://design-system.service.gov.uk/accessibility/accessibility-strategy/).
