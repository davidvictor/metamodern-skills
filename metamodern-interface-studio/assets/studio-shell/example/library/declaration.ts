/*
 * The example library's index, as data: two groups and four components. Button has full documentation adapted from a
 * fictional source with adjusted marks, Icon button is hand-written with a static capture, Text field leaves one
 * section out, and Switch has no documentation, so each case the page handles is on show. Remove with example/.
 */
import type { LibraryDeclaration } from "@/studio/types"

export const exampleLibrary: LibraryDeclaration = {
  entry: "./example/library/frame.html",
  groups: [
    { id: "actions", label: "Actions" },
    { id: "inputs", label: "Inputs" },
  ],
  components: [
    { id: "button", label: "Button", group: "actions", summary: "Starts an action with one press.", keywords: ["action", "submit", "cta"] },
    { id: "icon-button", label: "Icon button", group: "actions", summary: "An action shown as an icon, named for assistive technology.", keywords: ["toolbar"] },
    { id: "text-field", label: "Text field", group: "inputs", summary: "One line of typed text with its label.", keywords: ["textbox", "form"] },
    { id: "switch", label: "Switch", group: "inputs", summary: "Turns one setting on or off at once.", keywords: ["toggle"] },
  ],
}
