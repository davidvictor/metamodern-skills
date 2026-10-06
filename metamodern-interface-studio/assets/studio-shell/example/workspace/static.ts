/* The static build's module map (example/static-adapter.ts): two host-free modules. Sync is left out; it cannot open without operations. */
import { defineWorkspace } from "@studio/workspace"
import { CatalogPage, NotesPage } from "./catalog"

export default defineWorkspace({
  catalog: { Page: CatalogPage },
  notes: { Page: NotesPage },
})
