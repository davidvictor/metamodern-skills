# Connector Workflow and Truthful Handoffs

## Before every edit

Resolve the exact target from the request and current context, and load the applicable official Figma prerequisite skill. Reuse guidance already loaded for the same operation. Inspect the current page and node structure, capture a rendering, and load needed fonts before mutating text. Preserve component connections, overrides, crop positions, auto layout, and user-made adjustments. Keep connector writes small and sequential; read each result back before chaining another change. After an uncertain write, inspect current state before retrying.

## During construction

Create native frames for pages, slides, and screens, and build each one with auto layout: the frame itself, its regions, photo grids as rows and columns, and text stacks. Use gaps and padding for spacing, fill and hug for sizing, and nested auto layouts where gaps differ. Do not position layouts by hand-set x and y or with empty spacer frames. Put deliberate overlaps, such as tilted cards or fades over photos, as absolutely positioned children inside an auto layout parent. Keep artwork as selectable unlocked children. Name the canonical section and any exploration or review section clearly.

## Verification

Structural verification checks page and node identity, properties, variables, instances, clipping, text, and fonts, and confirms auto layout on every container, with no spacer frames and absolute positioning only where overlap is intended. Visual verification checks a fresh rendering for cropping, overflow, overlap, hierarchy, readable type, and unintended style drift. Check every known accessible consumer after a shared-library change.

## UI handoff protocol

The connector may not be able to publish a library, enable a consumer library, administer permissions, configure a team template, set a Slides-native behavior, or verify device and exported-artifact behavior. Say exactly what remains, where it must happen, and what needs verification afterward. Do not substitute a claim, approximation, or remembered state for proof.

## Comment protocol

Inspect comments in read-only mode. Categorize requested comments as actionable, informational, blocked, obsolete, or outside scope; state whether each remains relevant and propose the smallest resolution. Implement only when the user authorizes the change. Resolve a comment only when resolution is authorized and the specific change is verified; a request to review comments is complete with findings.
