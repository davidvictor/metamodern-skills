# Figma export

How to read the frames, export them, and neutralize effects that break some PDF viewers, without changing the director's file.

## Preflight (read-only)

Run this with `use_figma` after loading the official `figma-use` guidance. Set `ROOT_IDS` to the section or frame IDs to export, and `LINK_LAYERS` to the layer names that should be clickable (for example the logo). It returns everything the manifest and the risk review need.

```js
const ROOT_IDS = ['10:2'];               // a section, or individual frames, in page order
const LINK_LAYERS = ['Logo', 'Brand link'];  // exact layer names to make clickable
const frames = [];
for (const id of ROOT_IDS) {
  const root = await figma.getNodeByIdAsync(id);
  const list = ['SECTION', 'SLIDE_GRID', 'SLIDE_ROW'].includes(root.type)
    ? root.findAll(n => n.type === 'FRAME' && n.parent.type === 'SECTION' || n.type === 'SLIDE') : [root];
  for (const f of list) {
    const fb = f.absoluteBoundingBox;
    const rel = b => [+(b.x - fb.x).toFixed(1), +(b.y - fb.y).toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)];
    const links = f.findAll(n => LINK_LAYERS.includes(n.name) && n.visible)
      .map(n => ({ id: n.id, name: n.name, rect: rel(n.absoluteBoundingBox) }));
    // Effects Figma writes as soft masks with transfer functions: inner shadows, and drop shadows
    // with "show shadow behind node" turned off.
    const fragile = e => e.visible !== false && (e.type === 'INNER_SHADOW' || (e.type === 'DROP_SHADOW' && e.showShadowBehindNode === false));
    const risky = f.findAll(n => (n.effects && n.effects.some(fragile)) ||
        (n.blendMode && !['PASS_THROUGH', 'NORMAL'].includes(n.blendMode)))
      .map(n => ({ id: n.id, name: n.name, effects: n.effects.filter(fragile).map(e => ({ type: e.type, radius: e.radius, spread: e.spread, offset: e.offset, behind: e.showShadowBehindNode })), blend: n.blendMode }));
    frames.push({ id: f.id, name: f.name, x: f.x, y: f.y, w: f.width, h: f.height, links, risky });
  }
}
return frames;
```

For a Figma Slides file, pass the slide grid or the slides themselves as `ROOT_IDS`, and follow the official `figma-use-slides` guidance as well as `figma-use`; `get_metadata` does not work on Slides files.

Order pages by their reading order in the file (section child order, or the order the director gives). Text hyperlinks need no entry: Figma exports links set on text ranges. Keep the result; the link boxes go straight into the manifest, because a Figma frame exports at 1 px to 1 PDF point with its top left at the origin.

## Export

Export each frame with `download_assets` (`fileKey`, `nodeId`, `defaultFormat: "pdf"`, no `defaultScale`) and download the returned URL promptly with `curl -f -L -o pNN.pdf URL`; the links expire. A frame PDF has live text, vector shapes, and its images at their placed resolution.

## Fragile effects and the export copy

Some Figma effects become PDF constructs that certain viewers draw wrongly. Known cases: an `INNER_SHADOW`, and a `DROP_SHADOW` with "show shadow behind node" turned off, both become soft masks with transfer functions (`/TR`), which some versions of Apple Preview paint as a solid box over the layer. `check_pdf.py` fails on any page that still contains one. Clip masks (`isMask` on a vector group, common in logos) export as plain clipping paths and need nothing unless the check fails.

Choose the fix by what the effect draws:

- **Draws nothing in Figma**, for example an inner shadow with radius 0 and a small spread, often left by HTML capture of inset borders: remove it in an export copy (below).
- **Draws something visible:** the copy must still look the same, so removing it or flipping a setting usually fails the comparison. Show the director the page and these options: rasterize just that layer in the export copy (export the layer as PNG at scale 4, place it as an image fill on a rectangle at the layer's render bounds, and hide the original), accept the risk with a recorded waiver in the manifest, or change the design. Do the chosen option and compare again.

Procedure, for each affected frame:

1. Clone the frame with `use_figma` and name it `TEMP export copy (delete) · <frame name>`. In a Design file, move the clone to the page root away from the work (for example 3000 px to the left). In Slides the clone joins the slide row as an extra slide; leave it where it lands and delete it as soon as its export is downloaded.
2. In the clone, change only the layers the preflight listed, and only the effect in question. Map each listed original layer to its twin in the clone by its child-index path, as below. Never select by broad criteria such as layer name or stroke alignment: copies contain many layers with generic names like `Container` and `Text`, and a broad filter silently edits the design.
   ```js
   const FRAME_ID = '10:469', LAYER_IDS = ['10:580', '10:594'];  // from the preflight
   const frame = await figma.getNodeByIdAsync(FRAME_ID);
   const copy = frame.clone();
   if (frame.type !== 'SLIDE') {
     figma.currentPage.appendChild(copy);
     copy.x = frame.absoluteBoundingBox.x - 3000; copy.y = frame.absoluteBoundingBox.y;
   }
   copy.name = 'TEMP export copy (delete) · ' + frame.name;
   const pathOf = n => { const p = []; while (n.id !== FRAME_ID) { p.unshift(n.parent.children.indexOf(n)); n = n.parent; } return p; };
   const changed = [];
   for (const id of LAYER_IDS) {
     const orig = await figma.getNodeByIdAsync(id);
     const twin = pathOf(orig).reduce((n, i) => n.children[i], copy);
     if (twin.name !== orig.name) throw new Error('mapping failed for ' + id);
     twin.effects = twin.effects.filter(e => e.type !== 'INNER_SHADOW');  // the change approved for this layer
     changed.push(twin.id);
   }
   return { copy: copy.id, changed };
   ```

3. Export the original frame and the clone as PNG at scale 2 with `download_assets`, and run `scripts/compare_renders.py original.png copy.png --diff diff.png`. Use the clone only when it prints `SAME`. If it prints `DIFFERENT`, look at the diff image: the change is visible, so stop and ask the director.
4. Export the clone as PDF and use it in the manifest in place of the original page. Keep the original export in `originals/`.
5. Delete every clone whose name starts with `TEMP export copy`, then confirm none remain and that the original layers still have their effects.

Report each replaced page and why. The director's frames are never edited.

## Things Figma export does not carry

- Links on vectors, images, frames, or components (logos, buttons): add them in the manifest.
- Prototype interactions and flows.
- Page labels, bookmarks, and document outline.
