/* The static build's documentation map (static-adapter.ts): the example library plus the wide Button row. Remove with example/. */
import { defineLibrary } from "@studio/library"

export default defineLibrary({
  button: () => import("./button"),
  "icon-button": () => import("./icon-button"),
  "text-field": () => import("./text-field"),
  "button-row": () => import("./button-row"),
})
