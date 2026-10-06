/* Example documentation with one section left out, to show how a gap reads. Remove with example/. */
import type { ComponentDocs } from "@studio/library"

export default {
  source: { name: "Example UI", version: "2.4.0", notice: "Adapted from the Example UI 2.4.0 documentation. Copyright the Example UI authors, MIT License." },
  preview: {
    groups: [
      { id: "states", label: "States", description: "Empty, filled, with an error and disabled.", scenario: "text-field:states", width: 560, height: 240, mobileHeight: 420, code: { language: "tsx", code: '<TextField label="Title" placeholder="What needs doing?" />\n<TextField label="Title" error="Add a title" />' } },
    ],
  },
  whenToUse: { body: [{ kind: "paragraph", text: "For one line of free text, such as a title or a name." }] },
  whenNotToUse: { body: [{ kind: "paragraph", text: "For a choice from a known list: use a select." }] },
  usage: { body: [{ kind: "code", language: "tsx", code: '<TextField label="Title" value={title} onChange={setTitle} />' }] },
  examples: { items: [] },
  api: {
    props: [
      { name: "label", type: "string", required: true, description: "The visible label." },
      { name: "error", type: "string", description: "A message shown under the field; marks it invalid." },
    ],
  },
  keyboard: { body: [{ kind: "paragraph", text: "Typing edits the value; Tab leaves the field." }] },
  accessibility: { body: [{ kind: "paragraph", text: "The label and any error are tied to the input." }] },
  motion: { body: [{ kind: "paragraph", text: "None." }] },
  responsive: { body: [{ kind: "paragraph", text: "Full width of its container." }] },
  notesForAI: { body: [{ kind: "paragraph", text: "Always give a label; a placeholder is not one." }] },
} satisfies ComponentDocs
