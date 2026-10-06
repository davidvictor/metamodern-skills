/* Hand-written example documentation with a static capture. Remove with example/. */
import type { ComponentDocs } from "@studio/library"

const pressed = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120" viewBox="0 0 400 120"><rect width="400" height="120" fill="#fafaf9"/><rect x="176" y="36" width="48" height="48" rx="10" fill="#ccfbf1" stroke="#0f766e" stroke-width="2"/><path d="M200 50v20M190 60h20" stroke="#0f766e" stroke-width="3" stroke-linecap="round"/></svg>')}`

export default {
  preview: {
    groups: [
      { id: "sizes", label: "Sizes", scenario: "icon-button:sizes", width: 400, height: 120, code: { language: "tsx", code: '<IconButton size="small" label="Add" icon={<PlusIcon />} />\n<IconButton label="Add" icon={<PlusIcon />} />\n<IconButton size="large" label="Add" icon={<PlusIcon />} />' } },
      { id: "pressed", label: "Pressed", description: "Recorded from the product; the pressed state cannot be held in a live preview.", capture: { src: pressed, alt: "An icon button in its pressed state" }, width: 400, height: 120 },
    ],
  },
  whenToUse: { body: [{ kind: "paragraph", text: "In toolbars and dense rows, for actions people recognise by their icon." }] },
  whenNotToUse: { body: [{ kind: "paragraph", text: ["For the main action of a view: use a ", { component: "button" }, " with a label."] }] },
  usage: { body: [{ kind: "code", language: "tsx", code: '<IconButton label="Add task" icon={<PlusIcon />} onClick={add} />' }] },
  examples: { intro: [{ kind: "paragraph", text: "The sizes above cover the common cases." }], items: [] },
  api: {
    props: [
      { name: "label", type: "string", required: true, description: "The accessible name, also shown as a tooltip." },
      { name: "icon", type: "ReactNode", required: true, description: "The icon." },
      { name: "size", type: '"small" | "medium" | "large"', default: '"medium"', description: "The size." },
    ],
  },
  keyboard: { body: [{ kind: "paragraph", text: [{ kbd: "Enter" }, " and ", { kbd: "Space" }, " press it."] }] },
  accessibility: { body: [{ kind: "paragraph", text: ["The ", { code: "label" }, " names the button; the icon is hidden from assistive technology."] }] },
  motion: { body: [{ kind: "paragraph", text: "None beyond the press." }] },
  responsive: { body: [{ kind: "paragraph", text: "Fixed size at every width." }] },
  performance: { body: [{ kind: "paragraph", text: "One element and one icon." }] },
  notesForAI: { body: [{ kind: "paragraph", text: "Always pass a label; an icon alone has no accessible name." }] },
} satisfies ComponentDocs
