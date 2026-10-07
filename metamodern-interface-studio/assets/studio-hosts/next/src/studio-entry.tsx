"use client"
import { StrictMode } from "react"
import "./index.css"
import App from "./App"
import { ThemeProvider } from "./components/theme-provider"
import { adapter } from "@/adapter"
export default function StudioEntry() {
  return <StrictMode><ThemeProvider storagePrefix={`studio.${adapter.id}`} defaultBrand={adapter.product.brandDefault ? (adapter.product.brand ?? null) : null}><App /></ThemeProvider></StrictMode>
}
