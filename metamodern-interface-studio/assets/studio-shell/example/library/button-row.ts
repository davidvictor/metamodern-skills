/* Example documentation for a wide component (static-adapter.ts declares it with `wide: true`). Remove with example/. */
import type { ComponentDocs } from "@studio/library"

export default {
  preview: {
    groups: [
      { id: "toolbar", label: "Toolbar", description: "A full row of actions, wider than the text column.", scenario: "button:in-a-row", width: 1200, height: 200, code: { language: "tsx", code: '<Row>\n  <Button variant="secondary">Cancel</Button>\n  <Button>Save changes</Button>\n</Row>' } },
      { id: "pair", label: "Pair", description: "Two actions at their natural size.", scenario: "button:styles", width: 560, height: 120 },
    ],
  },
  whenToUse: { body: [{ kind: "paragraph", text: "At the end of a form or a dialog, for its actions." }] },
  whenNotToUse: { body: [{ kind: "paragraph", text: ["For one action: use a ", { component: "button" }, "."] }] },
  usage: { body: [{ kind: "code", language: "tsx", code: "<Row>\n  <Button>Save changes</Button>\n</Row>" }] },
  examples: { intro: [{ kind: "paragraph", text: "The toolbar above is the common case." }], items: [] },
  api: { props: [{ name: "children", type: "ReactNode", required: true, description: "The buttons, primary last." }] },
  keyboard: { body: [{ kind: "paragraph", text: "Tab moves between the buttons in order." }] },
  accessibility: { body: [{ kind: "paragraph", text: "Each button keeps its own name." }] },
  motion: { body: [{ kind: "paragraph", text: "None." }] },
  responsive: { body: [{ kind: "paragraph", text: "The row wraps on narrow screens." }] },
  performance: { body: [{ kind: "paragraph", text: "A few elements." }] },
  notesForAI: { body: [{ kind: "paragraph", text: "Put the primary action last." }] },
} satisfies ComponentDocs
