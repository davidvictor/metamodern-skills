# Generic modal Close and diagnostic repair

Package 0.18.3 over immutable public base e3e026fd72c9559ed9218e8bfb352b25334de473. This is a grouped generic repair for modal Tab containment and long structured diagnostics. No private source, payload, font/control names or screenshots are included.

## Implementation

EditorPopoverClose registers a real Base UI Close part and renders the existing styled native Button. Current generic Close picker/Close directions actions use it in their original positions; protected product panels adopt the same exported component after updating. Button style props, controlled open/onOpenChange and normal uncontrolled closure remain. There is no hidden Close substitute, manual Tab handler or global legacy-modal change. [Vendor evidence](vendor.json) records installed 1.8.0 source hashes and the [official Root contract](https://base-ui.com/react/components/popover#root).

Local editor status, initialization and selection reasons add minimum-width constraints and overflow-wrap:anywhere. Full diagnostic text stays available; source/controller validation, last-valid output and save/export eligibility are unchanged. This does not restyle product frames or globally resize the shell.

## Exact evidence

- focus/red.json shows last Tab and first Shift+Tab escaping all 16 editor popup cases before registration. Red probes reset an already observed case using its actual visible Close action; they do not claim every escape automatically dismissed.
- focus/green.json passes 20 records: Vite/Next × Chromium/WebKit × 1440/390, testing Palette and Named directions boundary/interior navigation, visible Close, Escape/opener focus and nested phone-sheet survival. Four ordinary Studio-settings nonmodal cases preserve focus-outside behavior. Before/after Close width/height/classes match exactly; one native button is rendered without nested buttons.
- focus/modes.json passes 16 controlled-choice/uncontrolled cases. Controlled selection closes and changes the compiled palette; the explicit uncontrolled fixture omits controlled Root props and uses genuine Close/Escape/Tab containment. All cases retain opener focus/phone sheet and make no POST.
- diagnostics/red.json reproduces long synthetic path plus 64-hex-word overflow through a real compiler failure. diagnostics/green.json passes 12 both-host/engine/native 1440/768/390 cases with complete text ranges inside their paragraph/status bounds, reachable controls, same last-valid frame document/body/loaded output and disabled Save. diagnostics/reasons.json passes 12 additional phone cases for initial compiler, loader and unavailable-selection reasons, readable without fallback frames or writes.
- comparison.json records exact Close geometry/classes and legacy state equality; ready status widths/heights/text are unchanged. Ready x positions differ by at most 0.24px from entrance-animation sampling, so no pixel-identical positioning claim is made.
- source-freeze.json pins 14 implementation/metadata files. source.json records all 8 changed runtime hashes in canonical/Vite/Next/separate Next-production copies, plus exact self-contained fixture sources/hashes/adaptations. Only task-owned local maps choose uncontrolled/diagnostic variants; no remote loader or DOM error injection was used.
- focus/*-resources.json and diagnostics/*-resources.json record actual served document/script/style/font status, MIME and raw-body SHA256. Cached 304 and detached-frame body read failures remain visible. verified-fetches.json separately records fresh 200 hashes for those 8 URLs at the final source freeze; these are not retroactively claimed as original response bodies.
- update-preservation.json proves locked 0.18.2→0.18.3 updates in fresh Vite/Next consumers built from the old e3 archive: host retained, 12 protected file hashes unchanged, product name/custom script kept, 0 blocked. Install/runtime checks were deliberately skipped there; separate final host checks cover compilation. Generator policy is main first-parent released history plus current working version, so intermediate unmerged candidates are not canonical releases. Lock/2 carries its own base hashes.

[checks.json](checks.json) gives exact commands, versions, exits and logs: Node 22.22.1/24.21.0 each 234 tests/20 packages; actual Vite/Next type/lint/build exit 0 with existing warnings retained. Delegated Next logs/lineage are preserved rather than rerun. Normalized .txt outputs strip machine paths/trailing terminal whitespace and blank EOF lines before hashing; raw originals remain task-owned. Source whitespace defaults are unchanged.

## Reproduction on disposable consumers

Generate Vite/Next editor consumers from this checked source, install their declared dependencies, then restore the five product-fixture snapshots from source.json before starting the task-owned servers. The canonical example index and shared files remain unchanged. Each fixture entry supplies its exact path, source and SHA256; do not apply these test maps to a real product or installed skill.

```python
import json
from pathlib import Path
manifest = json.loads(Path("source.json").read_text())
consumer = Path("TASK_OWNED_CONSUMER")
for fixture in manifest["fixtures"]:
    path = consumer / fixture["path"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(fixture["source"])
```

Start Vite with VITE_STUDIO_ADAPTER=editor, Next with STUDIO_ADAPTER=editor. The verifiers use STUDIO_VITE_URL/STUDIO_NEXT_URL (defaults loopback 4221/4222), PLAYWRIGHT_MODULE and optional PLAYWRIGHT_WEBKIT_EXECUTABLE. Set PLAYWRIGHT_BROWSERS_PATH for the supplied Chromium bundle. Run:

```bash
POPOVER_OUTPUT=TASK_OWNED_OUTPUT node verify.mjs
POPOVER_OUTPUT=TASK_OWNED_OUTPUT node modes.mjs
DIAGNOSTIC_OUTPUT=TASK_OWNED_DIAGNOSTIC_OUTPUT node diagnostics/verify.mjs
DIAGNOSTIC_OUTPUT=TASK_OWNED_DIAGNOSTIC_OUTPUT node diagnostics/reasons.mjs
```

The fixtures are explicit local module variants, not a second Studio UI or token/CSS resolver. Source-controlled product model/validation and data-only adapter descriptors retain their contracts. Browser contexts are disposable; only local draft/choice state changes, with canonical POST denial checked where relevant.

## Boundaries

Independent review is recorded separately. Source/validation, public feature delivery, remote CI, private managed adoption, actual private controls review, canonical publication and user acceptance are distinct states. Root owns Git and private adoption. Product panels must use the real Close part after the checked update; generic proof does not claim private #19 cleared before that adoption. No merge, Agency pin/install or production deployment is claimed.
