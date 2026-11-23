---
name: metamodern-switch-account
description: Use when the user switches Claude accounts on the same Mac, or asks to bring, merge, sync, copy, or move Code sessions or projects between Claude accounts (another email, organization, or workspace), or says sessions from another account are missing from the sidebar. Syncs the desktop app's Code session lists across every account on the Mac so the work continues where it left off in any of them, keeps an undo list per account, and reports what an account switch does not carry.
---

# Metamodern Switch Account

## Purpose

Let the user keep working in whichever Claude account they sign in to on the same Mac. The Claude desktop app keeps a separate Code session list for each account and organization, so a switch makes the sidebar look empty or stale. The work itself is still on the Mac: every account writes its transcripts to the shared `~/.claude/projects`. Copying session entries between the lists makes those sessions appear, open, and continue in any account.

## What carries and what does not

Local and shared by every account on this Mac, so it needs nothing: project folders, transcripts, `~/.claude` skills, agents, commands, settings, `CLAUDE.md` files, and per-project memory.

Per account in the desktop app, which this skill syncs: the Code session list.

Tied to the account on claude.ai, which no local copy can bring: claude.ai Projects and chats, claude.ai memory, uploaded skills, connector sign-ins (each account authorizes its own), artifact ownership and edit access, and cloud routines. When the user asks for "everything", name these as things to reconnect or share by hand rather than implying they came across.

## Workflow

The script is `scripts/sessions.py` in this skill. It needs only Python 3. Every run syncs all the accounts on the Mac, not only the one signed in now, so the next switch, in any direction, finds every session already there.

1. **Find the accounts.** Run `python3 scripts/sessions.py accounts`. It lists every session list on the Mac, its size, its last activity and newest titles, and marks the one the desktop app is signed in to now (from the app's own record, so it is right even when the Claude Code command line is signed in to another account). Lists have no email on disk, so identify an account from its newest titles and folders.
2. **Agree the scope.** By default every session goes to every list that lacks it. Narrow it only when the user asks: `--since 3` (days) or `--since 2026-10-19`, `--folder ~/dev/project` (repeatable, also matches sibling folders such as `project-design` and worktrees inside it), or `--filter FILE` for a saved list (folder lines, and `title:` lines with a case-insensitive pattern). If the user keeps a filter file in their own setup, use it; a filter they chose once is not a reason to drop sessions they now ask for, so add `--folder` for those.
3. **Dry run.** `python3 scripts/sessions.py sync --dry-run`. It takes every list with sessions, plus the signed-in one even when empty, and leaves out the empty lists the app makes for organizations never used. For each list it shows the count per folder it would receive, how many it already has, how many fall outside the scope, and how many have no transcript on the Mac (Claude Code clears old transcripts; an entry without one gives a session that cannot open, so these are left out unless the user asks for `--include-empty`). Report each list, the signed-in one first.
4. **Sync.** Run `python3 scripts/sessions.py sync`. Each missing session is copied from the list where it was used last, so a session that continued in one account arrives with its newest title and date. The script never overwrites an entry already in a list, even one the app creates while it runs, and never changes the list it copies from. It clears each copy's Remote Control session handles, which belong to the account they came from; the transcript link is kept. It records each copy, with a fingerprint, in that list's undo list under `~/.local/state/metamodern-switch-account/`. A second sync right after finds nothing to copy.
5. **Restart the app.** The desktop app reads the session list only when it starts, so copies into the signed-in account stay invisible until the user quits it completely (Command Q, not closing the window) and reopens it. Copies into the other accounts show when the user next signs in to them. Restarting ends the current conversation, so let the user do it, or offer to and say that first. A user who reports missing sessions after a sync usually has not restarted yet: check the app's start time (`ps -axo lstart,comm` for `Claude.app`) against the sync time before looking for anything else.
6. **Verify.** After the restart, confirm the newest copied sessions are in the list. In the desktop app, the session listing tool shows them; otherwise ask the user to look in the sidebar, grouped by project.

`python3 scripts/sessions.py copy <from> <to>` (same options, `current` for the signed-in account) copies one way only. Use it only when the user asks to bring sessions from one account into another and leave the rest alone.

## Sessions in more than one list

A session already in a list is never replaced, even when it was used later in another account. Its transcript is shared, so it opens with every turn; only its date and title in the list are older. The dry run names these for the signed-in list and counts them for the others. Replacing the entry while the app is running risks the app writing its own copy back, so leave them.

A session deleted from one account's list comes back from the others on the next sync. To drop a session everywhere, archive it, or delete it in every account.

## Undo

`python3 scripts/sessions.py undo <list>` (`current` for the signed-in one) removes that list's copied entries again; the sync prints the command for each list it changed. An entry used in that account since the copy (its file changed) is kept unless the user asks for `--force`. Transcripts are never deleted, so undo only hides sessions; they stay in the other accounts and on the Mac. Run undo before opening the copied sessions, then restart the app: an entry the app rewrites at the moment undo checks it can be removed without `--force`, and a session already open in the app can come back from its memory until the restart.

## Closeout

Report each list synced (the signed-in one first) with the count copied per folder, anything left out and why, the sessions used later in another account, the undo commands, and whether the app has been restarted and the copies seen. Keep account IDs, emails, and the user's project filter in their own setup or memory, never in this skill.
