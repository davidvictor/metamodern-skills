# Web Product Design

Use a dedicated Web System Design file and separate working files. For an existing product, production and code are the baseline truth; during approved implementation, Figma expresses intended design; after acceptance, production returns as runtime truth. Record authority and the codebase in `00 · Overview`.

Start with primitives, semantic Light and Dark modes, layout, type, focus, elevation, media, and responsive guidance. Add component tokens for product components. Use the Project's actual breakpoints; for greenfield work, introduce a breakpoint only when content or behavior materially changes.

Use auto layout, constraints, fill and hug sizing, wrapping, and useful minimum and maximum dimensions. Design the smallest and largest supported targets plus meaningful structural breakpoints; resize intermediate states instead of keeping every device as a permanent canvas. Product components have deliberate states and accessible contracts, while complete screens remain native compositions.

For existing products, reconcile Figma with the current codebase before redesign. Code Connect is optional and useful only when the code maturity, system scale, and implementation plan justify it.

Before handoff, include required states, responsive targets, key prototype paths, approved content, accessibility intent, and annotations. Verify in Figma, then verify final responsive and accessible behavior in the implemented browser before claiming conformance.
