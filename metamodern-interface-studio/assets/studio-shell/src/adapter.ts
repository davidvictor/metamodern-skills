/*
 * The one product seam in the shell. Point this at the product's adapter
 * (generated from the manifest and runtime catalog) and at nothing else.
 * The other branches exist for the acceptance script (npm run acceptance)
 * and drop out of a normal build.
 */
import { exampleAdapter } from "@/adapters/example"
import { capturesAdapter, syntheticAdapter } from "@/adapters/synthetic"

const variant = import.meta.env.VITE_STUDIO_ADAPTER
export const adapter = variant === "synthetic" ? syntheticAdapter : variant === "captures" ? capturesAdapter : exampleAdapter
