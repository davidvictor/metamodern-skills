/* Example documentation adapted from a fictional source, with the product's adjustments marked. Remove with example/. */
import type { ComponentDocs } from "@studio/library"

export default {
  source: { name: "Example UI", version: "2.4.0", notice: "Adapted from the Example UI 2.4.0 documentation. Copyright the Example UI authors, MIT License." },
  preview: {
    playground: {
      scenario: "button:playground",
      width: 560,
      height: 160,
      properties: [
        { id: "label", label: "Label", kind: "text", default: "Save changes", maxLength: 80 },
        { id: "variant", label: "Variant", kind: "select", default: "primary", options: [{ id: "primary", label: "Primary" }, { id: "secondary", label: "Secondary" }, { id: "danger", label: "Danger" }] },
        { id: "size", label: "Size", kind: "select", default: "medium", options: [{ id: "small", label: "Small" }, { id: "medium", label: "Medium" }, { id: "large", label: "Large" }] },
        { id: "disabled", label: "Disabled", kind: "switch", default: false },
      ],
      code: { language: "tsx", code: "<Button>Save changes</Button>" },
    },
    groups: [
      { id: "styles", label: "Styles", description: "Primary for the main action, secondary beside it, danger for what cannot be undone.", scenario: "button:styles", width: 560, height: 120, code: { language: "tsx", code: '<Button>Primary</Button>\n<Button variant="secondary">Secondary</Button>\n<Button variant="danger">Danger</Button>' } },
      { id: "sizes", label: "Sizes", scenario: "button:sizes", width: 560, height: 120, code: { language: "tsx", code: '<Button size="small">Small</Button>\n<Button>Medium</Button>\n<Button size="large">Large</Button>' } },
      { id: "states", label: "States", scenario: "button:states", width: 560, height: 120, adjusted: "Busy shows a spinner and keeps its label", code: { language: "tsx", code: '<Button>Default</Button>\n<Button disabled>Disabled</Button>\n<Button busy>Saving</Button>' } },
    ],
  },
  whenToUse: { body: [{ kind: "list", items: ["To start an action on the current page, such as saving or sending.", "For the one main action of a form or dialog, as the primary style."] }] },
  whenNotToUse: {
    body: [
      {
        kind: "list",
        items: ["To go to another page: use a link.", { text: ["For an action shown only as an icon: use ", { component: "icon-button" }, "."], adjusted: "Points to this product's Icon button" }],
      },
    ],
  },
  usage: {
    body: [
      { kind: "paragraph", text: ["Import ", { code: "Button" }, " and give it a label that says what happens. Keep one primary button per view."] },
      { kind: "code", language: "tsx", title: "Save button", code: 'import { Button } from "./button"\n\nexport function Save() {\n  return <Button onClick={save}>Save changes</Button>\n}' },
    ],
  },
  examples: {
    intro: [{ kind: "paragraph", text: "Buttons combined with icons and with each other." }],
    items: [
      { id: "with-icon", label: "With an icon", description: "An icon before the label adds meaning, never replaces it.", scenario: "button:with-icon", width: 560, height: 140, code: { language: "tsx", code: "<Button>\n  <PlusIcon /> New task\n</Button>" } },
      { id: "in-a-row", label: "In a row", scenario: "button:in-a-row", width: 560, height: 140, adjusted: "Actions sit at the end of the row in this product", code: { language: "tsx", code: '<Row>\n  <Button variant="secondary">Cancel</Button>\n  <Button>Save changes</Button>\n</Row>' } },
    ],
  },
  api: {
    props: [
      { name: "children", type: "ReactNode", required: true, description: "The label." },
      { name: "variant", type: '"primary" | "secondary" | "danger"', default: '"primary"', description: "The style." },
      { name: "size", type: '"small" | "medium" | "large"', default: '"medium"', description: "The size." },
      { name: "disabled", type: "boolean", default: "false", description: "Shows the button and refuses presses." },
      { name: "type", type: '"button" | "submit" | "reset"', default: '"button"', description: ["The native ", { code: "type" }, "."], adjusted: "Defaults to button, so it never submits a form by accident" },
    ],
    notes: [{ kind: "paragraph", text: "Other native button attributes pass through." }],
  },
  keyboard: {
    body: [
      {
        kind: "table",
        columns: ["Key", "Action"],
        rows: [
          { cells: [[{ kbd: "Enter" }], "Presses the button."] },
          { cells: [[{ kbd: "Space" }], "Presses the button."] },
          { cells: [[{ kbd: "Tab" }], "Moves focus to the next control."] },
        ],
      },
    ],
  },
  accessibility: {
    adjusted: "Touch targets are at least 44 px in this product",
    body: [
      { kind: "list", items: ["The label is the accessible name; an icon alone needs a name of its own.", "Focus is drawn as a visible ring for keyboard use."] },
      { kind: "callout", tone: "warning", text: "Do not disable a button to explain an error. Say what is missing beside the form instead." },
    ],
  },
  motion: { body: [{ kind: "paragraph", text: "The press moves the button by one pixel; reduced motion removes it." }] },
  responsive: { body: [{ kind: "paragraph", text: "A button keeps its natural width. Rows of buttons wrap on narrow screens." }] },
  performance: { body: [{ kind: "paragraph", text: "A button renders one element with no effects." }] },
  notesForAI: { body: [{ kind: "list", items: [["Prefer ", { code: "variant=\"secondary\"" }, " for the second action in a row."], "Never put two primary buttons in one view."] }] },
} satisfies ComponentDocs
