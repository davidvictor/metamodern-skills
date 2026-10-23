---
name: metamodern-switch-account
description: Use when the user switches Claude accounts on the same Mac, or asks to bring, merge, sync, copy, or move Code sessions or projects from another Claude account (another email, organization, or workspace) into the one they are signed in to, or says sessions from another account are missing from the sidebar. Copies the desktop app's Code session list between accounts so the work continues where it left off, keeps an undo list, and reports what an account switch does not carry.
---

# Metamodern Switch Account

## Purpose

Let the user keep working after signing in to a different Claude account on the same Mac. The Claude desktop app keeps a separate Code session list for each account and organization, so a switch makes the sidebar look empty or stale. The work itself is still on the Mac: every account writes its transcripts to the shared `~/.claude/projects`. Copying the other account's session entries makes those sessions appear, open, and continue in the current account.

## What carries and what does not

Local and shared by every account on this Mac, so it needs nothing: project folders, transcripts, `~/.claude` skills, agents, commands, settings, `CLAUDE.md` files, and per-project memory.

Per account in the desktop app, which this skill copies: the Code session list.

Tied to the account on claude.ai, which no local copy can bring: claude.ai Projects and chats, claude.ai memory, uploaded skills, connector sign-ins (each account authorizes its own), artifact ownership and edit access, and cloud routines. When the user asks for "everything", name these as things to reconnect or share by hand rather than implying they came across.

## Workflow

The script is `scripts/sessions.py` in this skill. It needs only Python 3.

1. **Find the accounts.** Run `python3 scripts/sessions.py accounts`. It lists every session list on the Mac, its size, its last activity and newest titles, and marks the one the desktop app is signed in to now (from the app's own record, so it is right even when the Claude Code command line is signed in to another account). The other account has no email on disk, so identify it from its newest titles and folders, and confirm with the user when more than one could be the source.
2. **Agree the scope.** By default every session missing from the current account is copied, which after a switch is exactly the work done in the other account. Narrow it when the user asks: `--since 3` (days) or `--since 2026-10-19`, `--folder ~/dev/project` (repeatable, also matches sibling folders such as `project-design` and worktrees inside it), or `--filter FILE` for a saved list (folder lines, and `title:` lines with a case-insensitive pattern). If the user keeps a filter file in their own setup, use it; a filter they chose once is not a reason to drop sessions they now ask for, so add `--folder` for those.
3. **Dry run.** `python3 scripts/sessions.py copy <from> current --dry-run`. Report the count per folder, how many are already there, how many fall outside the scope, and any session with no transcript on the Mac (Claude Code clears old transcripts; copying an entry without one gives a session that cannot open, so these are left out unless the user asks for `--include-empty`).
4. **Copy.** Run the same command without `--dry-run`. The script never overwrites an entry already in the destination, even one the app creates while it runs, and never changes the source account. It clears each copy's Remote Control session handles, which belong to the old account; the transcript link is kept. It records each copy, with a fingerprint, in an undo list under `~/.local/state/metamodern-switch-account/`.
5. **Restart the app.** The desktop app reads the session list only when it starts, so the copies stay invisible until the user quits it completely (Command Q, not closing the window) and reopens it. Restarting ends the current conversation, so let the user do it, or offer to and say that first. A user who reports missing sessions after the copy usually has not restarted yet: check the app's start time (`ps -axo lstart,comm` for `Claude.app`) against the copy time before looking for anything else.
6. **Verify.** After the restart, confirm the newest copied sessions are in the list. In the desktop app, the session listing tool shows them; otherwise ask the user to look in the sidebar, grouped by project.

## Sessions in both accounts

A session that was already in both lists and then continued in the other account is not replaced. Its transcript is shared, so it opens here with every turn; only its date and title in the list are older. The dry run names these. Replacing the entry while the app is running risks the app writing its own copy back, so leave them.

## Undo

`python3 scripts/sessions.py undo current` removes the copied entries again. An entry used in this account since the copy (its file changed) is kept unless the user asks for `--force`. Transcripts are never deleted, so undo only hides sessions; they stay in the other account and on the Mac. Run undo before opening the copied sessions in this account, then restart the app: an entry the app rewrites at the moment undo checks it can be removed without `--force`, and a session already open in the app can come back from its memory until the restart.

## Closeout

Report the source and destination account, the count copied per folder, anything left out and why, the sessions that continued in both, the undo command, and whether the app has been restarted and the copies seen. Keep account IDs, emails, and the user's project filter in their own setup or memory, never in this skill.
