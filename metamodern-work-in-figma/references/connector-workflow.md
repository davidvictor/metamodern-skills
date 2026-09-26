# Connector Workflow and Truthful Handoffs

## Before every edit

Resolve the exact target from the request and current context, and load the applicable official Figma prerequisite skill. Reuse guidance already loaded for the same operation. Inspect the current page and node structure, capture a rendering, and load needed fonts before mutating text. Preserve component connections, overrides, crop positions, auto layout, and user-made adjustments. Keep connector writes small and sequential; read each result back before chaining another change. After an uncertain write, inspect current state before retrying.

## During construction

Create native frames for pages, slides, and screens. Use auto layout where it improves a repeatable module or product behavior, not to make editorial art direction inflexible. Keep artwork as selectable unlocked children. Name the canonical section and any exploration or review section clearly.

## Verification

Structural verification checks page and node identity, properties, variables, instances, clipping, text, and fonts. Visual verification checks a fresh rendering for cropping, overflow, overlap, hierarchy, readable type, and unintended style drift. Check every known accessible consumer after a shared-library change.

## UI handoff protocol

The connector may not be able to publish a library, enable a consumer library, administer permissions, configure a team template, set a Slides-native behavior, or verify device and exported-artifact behavior. Say exactly what remains, where it must happen, and what needs verification afterward. Do not substitute a claim, approximation, or remembered state for proof.

## Comment protocol

Inspect comments in read-only mode. Categorize requested comments as actionable, informational, blocked, obsolete, or outside scope; state whether each remains relevant and propose the smallest resolution. Implement only when the user authorizes the change. Resolve a comment only when resolution is authorized and the specific change is verified; a request to review comments is complete with findings.
