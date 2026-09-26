# iOS Product Design

Use a dedicated iOS System Design file and separate working files. The Project library owns project-specific tokens, brand assets, and components above platform conventions. Add Apple's current official Figma UI kit only as an external per-Project dependency; never copy Apple components into the Project library or republish them.

Begin with primitives, semantic dynamic colors with Light and Dark modes, component tokens, typography, spacing, radii, materials, elevation, motion, media, and safe-area guidance. Use auto layout and constraints. Keep safe areas, status, navigation, tabs, keyboard behavior, and system regions visible and editable.

Use representative device targets and meaningful phone and tablet cases, not a permanent canvas for every device. Create project-specific components with stable states; complete screens and flows remain native. Use recipes for navigation stacks, modal sheets and forms, lists, and tab roots.

For handoff, document safe-area behavior, device classes, states, prototype paths, accessibility intent, and annotations. Verify dynamic content, Light and Dark behavior, safe-area editability, component connections, and phone and tablet layouts. Device and assistive-technology conformance must be verified outside Figma.
