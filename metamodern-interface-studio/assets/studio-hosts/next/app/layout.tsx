import type { ReactNode } from "react"
import config from "../studio.config"
export const metadata = { title: config.title }
/** Keep product iframe routes free of Studio CSS; shell styles load only with its client entry. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{ margin: 0 }}>{children}</body></html>
}
