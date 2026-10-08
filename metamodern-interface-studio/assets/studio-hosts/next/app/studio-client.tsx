"use client"
import dynamic from "next/dynamic"
// A client boundary alone still prerenders. The browser-owned store must never initialize on the server.
const Studio = dynamic(async () => {
  const { initializeHost } = await import("../src/studio-host")
  await initializeHost()
  return import("../src/studio-entry")
}, { ssr: false })
export default function StudioClient() { return <Studio /> }
