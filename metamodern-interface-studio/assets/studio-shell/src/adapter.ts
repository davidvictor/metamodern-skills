/*
 * The one product seam in the shell. Point this at the product's adapter
 * (generated from the manifest and runtime catalog) and at nothing else.
 */
import { exampleAdapter } from "@/adapters/example"

export const adapter = exampleAdapter
