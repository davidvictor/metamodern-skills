# Core Working Rules

## System boundary

For authorized Project creation, create a small local design system. For existing work, use and preserve its system; a review reports system gaps without creating or restructuring it. Publish it as a Design library only when another file needs to consume it. A document can keep the system and deliverable in one Design file. Deck and product Projects generally need a dedicated Design system source; a deck's narrative belongs in its Figma Slides file. Do not reuse one Project library as a universal dependency.

Start with primitives, semantic aliases, layout variables, readable text styles, and intentional Light and Dark modes. Web and iOS product systems add component tokens when component-specific reuse exists. Keep names semantic and slash-separated.

## Components and compositions

Componentize repeated, bounded elements only. Complete pages, slides, screens, and flows are native frames composed from components and ordinary layers. A component needs a concise description, useful defaults, and a stable editing contract. Use variants only for one semantic object; use properties for deliberate choices and slots for an open content region. Improve existing families instead of fragmenting replacements.

## Editable media

Use a clipped zero-padding frame for bleed media whose crop needs manual control. Put the image, logo, or artwork as an unlocked named child inside it. The child may use an image fill. Never make a crop container's direct image fill the only editable media mechanism unless it is intentionally fixed decoration.

## Authority and governance

Declare the authoritative source for copy, visual specification, behavior, and data in `00 · Overview`. Preserve approved content. Recompose before reducing legibility. Treat comments as requests, not authorization. Branching, ownership changes, file splits, permissions, and breaking component changes require an explicit user decision.

Keep one live canonical deliverable and clearly labeled review areas. Do not duplicate canvases as informal history or use file copies to avoid resolving source authority.

## Evidence loop

Before an edit, inspect the source, live structure, relevant comments, and current rendering. After the edit, make a fresh structural readback and visual review. Report unknowns and unsupported connector actions as exact handoffs.
