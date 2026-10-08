export type IconProfile = { schema: "studio-icon-profile/1"; edition: "free" | "pro"; package: string; version: string; style: "stroke-rounded" }
export const PROFILE_FILE: string
export const ICON_PROFILES: Readonly<Record<"free" | "pro", IconProfile>>
export function parseIconProfile(data: unknown): IconProfile
export function assertIconProfileLock(recorded: unknown, profile: IconProfile): void
export function readIconProfile(root: string): IconProfile
export function projectIconPackage<T extends { dependencies?: Record<string, string> }>(pkg: T, profile: IconProfile): T & { dependencies: Record<string, string> }
export function parseGlyphAliases(source: string): Map<string, string>
export function prepareIconProfile(root: string, selected?: IconProfile): { profile: IconProfile & { renderer: { package: string; version: string }; glyphs: number; sourceFingerprint: string; mapFingerprint: string; importFingerprint: string }; glyphs: string; metadata: string }
export function activateIconProfile(root: string, edition: "free" | "pro"): ReturnType<typeof prepareIconProfile>
