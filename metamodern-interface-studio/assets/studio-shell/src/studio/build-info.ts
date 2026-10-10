import type { StudioProvenance } from "./types"

/** The shell release these files came from. Releasing a shell change updates it with PACKAGE_VERSION. */
export const SHELL_VERSION = "0.20.0"

const COMMIT = /^[0-9a-f]{7,64}$/i

/** The calm chrome line for a build: the product's source revision (short for a commit) and this shell's version. */
export function provenanceSummary(provenance: StudioProvenance | undefined) {
  const revision = provenance?.revision.trim()
  const short = revision ? (COMMIT.test(revision) ? revision.slice(0, 7) : revision) : null
  const source = short ? `${short}${provenance?.modified ? ", modified" : ""}` : "not recorded"
  const full = revision ? `${revision}${provenance?.modified ? " plus uncommitted changes" : ""}` : "not recorded by this build"
  return {
    source,
    commit: !!revision && COMMIT.test(revision),
    shell: SHELL_VERSION,
    text: `Source ${source} · Shell ${SHELL_VERSION}`,
    description: `Built from source ${full}; Interface Studio shell ${SHELL_VERSION}`,
  }
}
