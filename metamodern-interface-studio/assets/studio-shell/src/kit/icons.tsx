import * as React from "react"
import {
  ActivityIcon, BoxesIcon, CheckIcon, CopyIcon, DatabaseIcon, DownloadIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, FileTextIcon, FlagIcon, GlobeIcon,
  KeyIcon, LanguagesIcon, LayersIcon, MailIcon, PlugIcon, PlusIcon, RefreshIcon, SearchIcon, ServerIcon, SettingsIcon, ShieldIcon, TableIcon,
  TerminalIcon, DeleteIcon, UploadIcon, UsersIcon, WrenchIcon, XIcon, type IconComponent,
} from "@/icons"
import type { StudioIcon } from "@/studio/types"

/** Module icons the adapter may name. */
const MODULES: Record<StudioIcon, IconComponent> = {
  activity: ActivityIcon, boxes: BoxesIcon, database: DatabaseIcon, "file-text": FileTextIcon, flag: FlagIcon, globe: GlobeIcon, key: KeyIcon,
  languages: LanguagesIcon, layers: LayersIcon, mail: MailIcon, plug: PlugIcon, server: ServerIcon, settings: SettingsIcon, shield: ShieldIcon,
  table: TableIcon, terminal: TerminalIcon, users: UsersIcon, wrench: WrenchIcon,
}
/** Actions modules use. */
const ACTIONS = {
  plus: PlusIcon, trash: DeleteIcon, refresh: RefreshIcon, copy: CopyIcon, eye: EyeIcon, "eye-off": EyeOffIcon, search: SearchIcon,
  check: CheckIcon, x: XIcon, "external-link": ExternalLinkIcon, download: DownloadIcon, upload: UploadIcon,
} satisfies Record<string, IconComponent>

export type KitIconName = StudioIcon | keyof typeof ACTIONS
const ALL: Record<KitIconName, IconComponent> = { ...MODULES, ...ACTIONS }

/** An icon from the Studio's fixed set. Decorative: name the control it sits in. */
export function Icon({ name, className }: { name: KitIconName; className?: string }) {
  return React.createElement(ALL[name], { "aria-hidden": true, className })
}
