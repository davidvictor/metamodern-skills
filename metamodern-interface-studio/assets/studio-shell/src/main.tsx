import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { adapter } from "@/adapter"

document.title = `${adapter.product.name} Studio`

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider storagePrefix={`studio.${adapter.id}`}>
      <App />
    </ThemeProvider>
  </StrictMode>
)
