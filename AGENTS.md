<!-- GENERATED from claude-setup/global/CLAUDE.md - edit there, then re-run the export. -->

# Global Rules for Claude

Default engineering guidelines for all my projects. A project's own `CLAUDE.md`
takes precedence where it is more specific or conflicts.

**Tradeoff:** these bias toward caution over speed. For trivial tasks, use judgment.

## Right-Size the Effort (match ceremony to task size)

Pick the lightest approach that fits. Over-planning a one-line fix wastes time and
tokens; under-planning a big feature causes rework. Judge by *blast radius and
uncertainty*, not just line count.

- **Small** (1–2 files, clear, low risk — typo, copy tweak, obvious bug):
  edit directly. No spec, no plan. Use GitNexus `impact` only if the symbol is shared.
  Verify with the existing tests / a quick run.
- **Medium** (a feature, a few files, some unknowns):
  brief plan first (the 3-step "step → verify" format below). Use GitNexus to navigate
  and check impact before editing. Write/extend tests. Run `/code-review` before done.
- **Large** (cross-cutting, many files, real design choices, migrations):
  use the **brainstorm → spec → plan → execute** workflow and record an ADR for the
  key decisions. Use GitNexus `impact` on every shared symbol. For independent parallel
  work, dispatch subagents / a workflow rather than doing it all serially. Verify with
  the full test suite and explicit verification-before-completion.

When unsure which tier, state your read in one line and proceed — don't stall.

## Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work")
require constant clarification.

## Core Engineering Principles

Shared vocabulary for the rules below. Treat each as a heuristic, not a law — when two
conflict, prefer the one that keeps the code **simplest to change**.

- **KISS** — the simplest thing that works; complexity must earn its place. (→ Minimal-Code Rule)
- **DRY** — one source of truth per piece of knowledge; dedupe on the *third* real repeat,
  not the second imagined one. (→ Reuse > Enhance > Create)
- **YAGNI** — build what's needed now, not what might be needed later.
- **Measure before optimizing** — no performance guessing; profile first and optimize the
  *proven* hot path, not the imagined one. Premature optimization is a YAGNI violation. (→ YAGNI)
- **SOLID** — single-responsibility, open/closed, Liskov-substitutable, interface-segregated,
  dependency-inverted; lean on it for OO design without dogmatizing it.
- **Separation of concerns** — one module, one reason to exist; don't tangle I/O, business
  logic, and presentation.
- **Composition over inheritance** — assemble behavior from small parts; use inheritance only
  for genuine is-a hierarchies.
- **Least astonishment** — code does what its name and signature promise; no hidden side effects.
- **Fail fast** — validate at the boundary; surface errors loudly and early rather than limping
  on bad state.
- **Security by default** — treat every external input as hostile and every secret as radioactive:
  validate at the trust boundary, never hard-code or log secrets, parameterize queries (no
  string-built SQL/commands), check authorization at each entry point, grant least privilege.
  When unsure, choose the safer option. (→ Guard the boundaries)
- **Make illegal states unrepresentable** — encode invariants in types/data shapes so bad
  combinations can't be built.
- **Pure core, imperative shell** — push side effects (I/O, network, time, randomness) to the
  edges; keep the logic between them pure and testable.
- **Explicit over implicit** — clear beats clever; a confused reader is a latent bug.
- **Design patterns are a tool, not a goal** — reach for a named pattern (Strategy, Factory,
  Adapter, Observer, Repository…) only when it removes real, *present* complexity; never add
  indirection for a pattern's sake.

## Everyday Habits

- **Name for intent** — variables/functions read like prose; no `tmp`, `data2`, or abbreviations
  a newcomer can't decode.
- **Comment the *why*, not the *what*** — code states what; comments explain rationale,
  trade-offs, and gotchas.
- **Small, focused units** — short functions, narrow interfaces, shallow nesting; early-return
  over deep `if` pyramids.
- **Handle errors deliberately** — no silent catches; handle, wrap with context, or propagate —
  never swallow.
- **Guard the boundaries** — validate and sanitize every external input (args, env, network,
  files); trust nothing from outside.
- **Leave it tested** — each behavior change ships with a test that would fail without it.
- **Test behavior, not implementation** — assert on observable outcomes, not internals or mocks,
  so refactors don't break green tests; one reason to fail per test. (→ Leave it tested)
- **Boy-Scout within scope** — tidy code you're already touching; don't sprawl into unrelated
  cleanup. (→ Minimal-Code Rule)
- **Consistency over personal taste** — match the surrounding code's conventions even if you'd
  choose differently.

## Component & Code Reuse (Reuse > Enhance > Create)

Before writing ANY new component, function, hook, util, type, or module:

1. **Search first.** Grep/Glob for existing implementations that already solve, or
   partially solve, the problem (shared UI, `lib/`, utils, hooks, nearby siblings).
2. **Reuse > Enhance > Create**, in that strict order:
   - **Reuse** the existing piece as-is if it fits.
   - **Enhance** it (optional prop / param / generic / overload) if a small,
     additive, non-breaking extension covers the new case. Defaults must preserve
     old behavior; every existing caller must keep working unchanged.
   - **Create new** only if reuse and enhancement are both genuinely worse
     (document why in the PR/commit, not in code comments).
3. **No parallel implementations.** If two things do the same job, consolidate —
   don't add a third. Never copy-paste a component to tweak it.
4. **Vet before depending.** The same order applies to *external* packages: a new dependency
   is a permanent liability (supply chain, maintenance, bundle size). Prefer the standard
   library or a dep already in the project; add a new one only when it carries real weight,
   and note why.
5. **Curated component sources (optional).** When a task genuinely calls for polished,
   animated marketing/landing UI in a React + Tailwind + Framer Motion project, you *may*
   consider pulling from a free copy-paste registry instead of hand-rolling the animation —
   e.g. Aceternity UI
   (`npx shadcn@latest add https://ui.aceternity.com/registry/<component>.json`) or the
   21st.dev community registry (free shadcn-style CLI install of community components). This
   is a suggestion, not a default — only reach for it if it fits the project's existing stack
   and aesthetic, and never for minimalist/quiet designs.

## Minimal-Code Rule

Write the **smallest, simplest, most direct** code that satisfies the requirement.

- No speculative abstractions, "future-proofing", or options nobody asked for.
- No wrapper components, helper hooks, or service layers unless they remove real
  duplication that exists _today_.
- Prefer composition with existing primitives; prefer extending a prop interface
  over forking a component.
- Match existing style, even if you'd do it differently. Don't refactor things
  that aren't broken or "improve" adjacent code outside your task.
- Delete dead code **your own change orphaned** (imports/vars/functions that became
  unused because of your edit). For **pre-existing** dead code unrelated to your
  change, **mention it — don't delete it** unless asked.
- Three similar lines beats a premature abstraction; abstract on the third real
  duplicate, not the second imagined one.

## Non-Breaking Enhancements

- New props/params are **optional** with safe defaults; public signatures stay
  backwards-compatible.
- If a breaking change is genuinely required, update **all** call sites in the same
  change and call it out explicitly.
- Re-run/verify any tests covering the enhanced piece before claiming done.

## Decision Documentation

Document any non-trivial choice that isn't obvious from the code and that a future
reader could reasonably question or want to reverse (architecture, a library/pattern
choice, a trade-off that closed off other options, a workaround, a new convention).

- One file per decision in `docs/decisions/`, named `NNNN-kebab-title.md`
  (zero-padded sequential).
- Records are append-only. To change a decision, write a **new** record and mark the
  old one `Superseded by NNNN`.
- Each record: Context · Problem · Options considered · Decision · Why · Consequences.
- **Before** designing in an area, check `docs/decisions/` for an Accepted record and
  follow it — don't re-litigate. Add a new record in the same change as the code that
  enacts it. If a task forces you to act against an existing decision, **stop and
  surface it** with the record number rather than overriding silently.

## Multi-Agent Orchestration

Default to the native `Agent` tool for parallel work — fan independent subtasks out,
then merge results. It covers background workers (`run_in_background`) and worktree
isolation (`isolation: "worktree"`) with no extra setup, and is the lighter choice.

Reach for ruflo's swarm tools (find them via ToolSearch) **only** when a task
genuinely needs something native agents cannot do: live shared memory between agents
mid-run, consensus/voting across agents, or a fleet that persists across sessions.
Do not auto-invoke ruflo for ordinary multi-file work — when in doubt, use native agents.

# Ruflo Integration (auto-generated by ruflo init)
When working on multi-file tasks or complex features, use ToolSearch to find and invoke ruflo MCP tools.
Key tools: memory_store, memory_search, hooks_route, swarm_init, agent_spawn.
Check system-reminder tags for [INTELLIGENCE] pattern suggestions before starting work.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **SOM-SIG** (725 symbols, 974 relationships, 17 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/SOM-SIG/context` | Codebase overview, check index freshness |
| `gitnexus://repo/SOM-SIG/clusters` | All functional areas |
| `gitnexus://repo/SOM-SIG/processes` | All execution flows |
| `gitnexus://repo/SOM-SIG/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
