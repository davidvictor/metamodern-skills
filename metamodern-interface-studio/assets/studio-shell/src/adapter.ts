/*
 * The one product seam in the shell, and a product-owned file: the shell
 * update never changes it. Point `adapter` at the product's adapter declaration
 * (generated from the manifest and runtime catalog) and at nothing else.
 */
import { exampleAdapter } from "@/adapters/example"

export const adapter = exampleAdapter
