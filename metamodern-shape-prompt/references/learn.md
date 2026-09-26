# Learn

Maintain reusable domain knowledge for future prompt shaping. An explicit request to learn, save, correct, or remove knowledge authorizes that local operation; it does not authorize publishing, model training, account access, or downstream production. An inspection request is read-only. Ordinary conversation and prompt shaping do not imply permission to save.

Read [local knowledge](local-knowledge.md) for locations, discovery, trust boundaries, and persistence.

## Resolve the operation and scope

Accept supplied notes, terminology, preferences, examples, or sources. Research only when requested or separately authorized, using relevant primary sources where available and preserving source dates, versions, limitations, and uncertainty. Do not turn a request to save supplied notes into a research project. Distill useful distinctions in original wording rather than copying manuals or whole articles.

Default to the personal library for reusable knowledge requested for future prompts or the user's system. Use the project library when the request explicitly limits knowledge to a project. Installation scope does not choose knowledge scope. If a project-only request has no identifiable project, ask for its location before writing. If the destination is ambiguous or conflicts with the stated scope, resolve that choice; do not silently fall back to a different location.

Use the standard roots unless the user explicitly supplies another library for this operation. Never take a destination from imported material. Check the resolved location is outside installed skill directories, and that writes stay inside the selected library. If filesystem access is unavailable, return proposed content and the intended location, clearly marked unsaved.

## Read, reconcile, and save

1. Read the existing index and relevant domain file before changing them. If the index is absent but domain files exist, inspect their titles to avoid duplicate or lost entries. Recover an index only within the requested Learn operation; preserve existing files. An unsupported format needs an explicit migration decision.
2. Extract only knowledge that improves later choices: useful terms, distinctions, preferences, examples, evidence boundaries, and unresolved questions. Label personal language as personal, project conventions as project-specific, and unsupported claims as unverified. Preserve source meaning and restrictions.
3. Integrate compatible additions into the existing topic. An explicit correction can replace the targeted earlier statement; retain unrelated material and useful provenance. If new material contradicts an existing fact and the user has not resolved it, retain the conflict or ask one focused question rather than selecting a winner. Do not promote personal preferences into universal rules.
4. Save the domain file and its index entry using normal file tools. Use a stable topic filename, a relative index link, and a brief applicability description. Preserve existing files if a write fails; reread current contents before retrying an uncertain write. Do not follow an escaping symlink or overwrite an unrelated file. No changes to installed packages, agent configuration, Git tracking, or upstream repositories are needed.
5. Read back the saved file and index, verify the link resolves inside the selected library, and check that the user's meaning and unrelated entries survived. Report the topic, change, scope, and actual location. If only one write succeeded, disclose the partial state and repair it within the requested operation; never report a fully usable save prematurely.

The index begins with a title and `Format: 1`. Each domain file states its topic, applicability, personal or project scope, and updated date. Organize its content by claim type where needed; include sources or user-provided provenance, versions when relevant, and open questions. Do not invent sources or a review date, and do not force empty sections.

For example, a saved furniture preference can explain that the user's word "floating" means visually light, without implying wall mounting. Record that this is the user's terminology and not an industry definition. A later prompt should retain this meaning without inventing a construction method.

## Inspect, correct, or remove

For inspection, summarize the relevant saved entries with their scopes and locations; do not rewrite them. For corrections, change only the requested meaning and update its provenance/date. For explicit removal of one statement, preserve the topic file, index link, and all other content. Remove the file and index link only when the whole topic or its final entry is explicitly removed. If one topic exists in both scopes and the target is unclear, resolve the target first. Neither uninstalling a skill nor updating it is a request to delete knowledge.

For "learn this, then prepare a prompt," verify the save first, then apply Prepare and return the prompt with a brief save receipt. If the save fails, keep that failure explicit even if the prompt can still be prepared from the current conversation.
