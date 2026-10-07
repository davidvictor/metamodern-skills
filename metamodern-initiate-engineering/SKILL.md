---
name: metamodern-initiate-engineering
description: Use when the user asks to establish, resume, or assess proportional engineering preparation for a named web application, mobile application, or website task and needs an executable first implementation or discovery handoff.
---

# Metamodern Initiate Engineering

## Purpose

Turn current project evidence into a named, executable first implementation or discovery task. This skill prepares engineering work; it does not invent product meaning, provision infrastructure, create a generic workflow engine, or impose an application stack on a website or mobile project.

## Choose the mode

- **Inspect:** map source authority, repository state, decisions, capabilities, tool access, and runnable commands read-only; report the missing facts that prevent a claim.
- **Initiate:** make authorized, reversible preparation changes required for the named task and produce its work packet.
- **Resume:** inspect the current state and existing evidence, reuse completed decisions, and prepare only what remains. Do not replay questions or setup.

Read [Engineering foundation](references/engineering-foundation.md), then select [Web application](references/profiles/web-app.md) for account, data, or authenticated application work, [Mobile application](references/profiles/mobile-app.md) for native/device work, or [Website](references/profiles/website.md) for public or editorial site work. Discover before interviewing. Preserve dirty work, existing authority, shared-code boundaries, and installed capabilities.

## Establish portable context without recursion

Project Preparation owns `PROJECT.md`, `REFERENCES.md`, and `AGENTS.md`; product, brand, design, and Figma owners retain their artifacts and authority. Read [Project artifacts](references/project-artifacts.md). In direct or preparation-led use, call `metamodern-prepare-project` when the portable core is missing or its required engineering fields are stale or absent. Pass established decisions and a portable-core-only scope. That call must preserve unrelated and upstream guidance, merge only the needed engineering facts, and not dispatch this skill or another engineering workflow.

Incomplete brand or interface direction does not block independent nonvisual engineering. Client-facing visual production follows the accepted Brand System and its owning capabilities.

## Configure engineering when authorized

In Initiate or authorized Resume setup, invoke `metamodern-configure-engineering` after verifying the project root and existing policy. It owns the portable testing policy, local profile, native Codex/Claude Code routing, and standalone configuration checker. Pass existing decisions and overrides; preview changes before applying them within the authorized scope. Reuse a current configured profile instead of regenerating it. Inspect mode reports the existing profile and gaps without installing it.

Return profile provenance, configuration-check results, selected models/efforts, and availability evidence to the project core and first-task handoff. Preserve local policy and report conflicts. Keep structural checks separate from native discovery and observed successful provider turns; none establishes application readiness. Register the canonical capability and generated profile through Project Preparation's narrow portable-core-only merge. Do not route that call back into initiation or configuration.

## Define the first task

Read [Interview](references/interview.md). Ask only small unresolved groups in dependency order. Separate discovered facts, reversible defaults, user-owned judgments, and deferred decisions. Stop when the selected task is sufficiently defined.

For a web app that needs account management, authentication, or persistent data, MakerKit is a likely option. Select it only from current task needs, then invoke `metamodern-bootstrap-app` with known decisions. Bootstrap is independently usable and returns to this caller; it must not restart initiation. Keep website and mobile starter choices open until the named task needs one.

Use [Readiness and handoff](references/readiness-and-handoff.md) to turn evidence into a work packet. After the interview, return newly settled engineering facts to Project Preparation for the same narrow merge when needed. A discovery task is a valid endpoint when a required starter, platform, or provider decision is open. Do not call it implementation-ready.

## Closeout

Return the selected mode, source revision, established decisions and their state, preservation boundaries, actual environment and resources, checks/review, readiness state, dependencies and owners, authorized delivery endpoint, and next action. State context preparation, local readiness, repository delivery readiness, deployment readiness, and live verification separately.

When the first task is defined, hand its outcome, preservation/replacement boundaries and delivery endpoint to `metamodern-plan-development` when available. A clear implementation request can continue through `metamodern-execute-development`; an Inspect or preparation-only request ends with its handoff. These companion skills do not require another initiation pass. If they are absent, use the owning project's development method.
