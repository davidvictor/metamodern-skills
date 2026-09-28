# Native integration and static fallback

Use this with [adapters.md](adapters.md) when native targets are in scope. Reuse an instrumented application preview build in a simulator/device or an available stream. Native instrumentation loads scenarios through existing application boundaries and reports stable semantic anchors, commands, navigation, readiness, and capture evidence where supported. Keep real product rules in the application.

## Establish what can actually run

Identify platform, build/source revision, instrumented entry, available simulator or device, tooling, profile, permissions, and connection method. A stream is transport, not proof of input, reset, or inspection support. Negotiate those capabilities and verify a command round trip before advertising them. A simulator cannot establish physical-device behavior for hardware or OS integrations it does not implement.

Map scenario navigation to the application's tab roots, push stacks, sheets/modals, and dismissal/back conventions. Apply state and navigation through the atomicity contract. Profiles identify actual device dimensions, scale, orientation, safe areas, text size, and relevant input/system appearance. Do not fabricate native metrics from browser viewport dimensions. Unsupported configurations must fail clearly before playback.

Use native rendering and input conventions. Web/native may share IDs, fixture meaning, and semantic token intent without sharing components or navigation code. A responsive web page, WebView mirror, or HTML recreation must be classified according to its actual renderer; none proves native rendering, navigation, accessibility, or OS behavior.

## When live native access is unavailable

Use verified captures as an explicitly static, read-only fallback. Each image needs original capture provenance: application/build/source identity, target/environment, scenario and fixture mapping where known, profile, axes, capture time and artifact identity. Keep unavailable fields and uncertain scenario mappings explicit. A supplied image without enough provenance is an unverified reference image or illustration, not a verified native preview.

Show “Static native capture” and its freshness beside the preview. Offer selection, zoom, metadata, and matching existing capture variants. Do not offer product taps, product back, runtime reset, semantic tree inspection, or live theme/profile changes. “Reload capture” may restore the chosen image, but must not claim to reset native state. Image annotations are presentation annotations, not executable native anchors. Capture switching cannot prove a product transition.

A native walkthrough can explain a sequence of static states if every step is labeled accordingly; it cannot claim the sequence was executed. Its commands remain unavailable or are replaced by explicit presenter advance, never simulated as successful application commands. Missing corresponding captures produce unresolved steps or unsupported comparisons rather than silently displaying a web substitute.

## Verify the supported claims

With a live target, exercise a meaningful command, direct navigation, back/dismiss, reset, isolation, and relevant native accessibility/input/system behavior. Record the exact simulator/device and build. With only static evidence, verify file/reference integrity, provenance, accurate capability controls, and visual inspection. Native runtime interactions, reset, accessibility tree, and OS checks remain **unavailable**. Report the reason and bounded next step needed to test them; do not install or build unrelated tooling merely to disguise the limitation.
