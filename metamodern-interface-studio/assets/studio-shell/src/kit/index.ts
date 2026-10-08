/*
 * studio-kit/1: the Studio's own components as a stable surface for workspace modules, imported as
 * @studio/kit (references/workspace.md). A change that breaks a module is a new major version and a
 * breaking shell release; the updater reports it before applying. Everything else under src/ stays
 * free to change.
 */
export const KIT_VERSION = "studio-kit/1"

export { Button, ModulePage, Section, Toolbar } from "./layout"
export { Field, type FieldProps } from "./field"
export { DataTable, PropertyList, StatusBadge, StatusTile, type Column, type StatusTone } from "./data"
export { SelectList, type SelectListGroup, type SelectListItem, type SelectListProps } from "./select-list"
export { ConfirmDialog, SaveBar, type SaveBarState } from "./save"
export { EmptyState } from "./empty"
export { PreviewFrame, type PreviewFrameProps } from "./preview-frame"
export { Icon, type KitIconName } from "./icons"
export { tokens } from "./tokens"
export { NumberField, SegmentedControl, EditorPopover, type NumberFieldProps } from "./design-controls"
