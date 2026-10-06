/* The example library's documentation map. Switch is declared but deliberately left out, to show how that reads. */
import { defineLibrary } from "@studio/library"

export default defineLibrary({
  button: () => import("./button"),
  "icon-button": () => import("./icon-button"),
  "text-field": () => import("./text-field"),
})
