# File Organization

Rules for where code goes in this repository. They describe the kind of code
each place holds, not the contents of specific files. Follow them when adding,
moving, or reviewing code.

**Principle: keep logic at its call site. Move it to a shared location only
when sharing becomes necessary, never preemptively.**

## Reviewing

When reviewing a change, check every added or moved file against these rules,
and check that new code sits in the allowed layer for its location. Report
violations as findings even when the code works correctly.

## `src/`

Root files are cross-cutting concerns shared by many commands, one flat file
per concern. These files may know about Prismic and the CLI.

## `src/commands/`

One file per CLI command, flat. The filename is the full command path with
dashes: `repo-create.ts` handles `prismic repo create`. Parent commands are
routers only, with no logic. Leaf command files own the user experience:
options, output, and orchestration of everything else. Logic stays in the
command file unless another command needs it.

## `src/lib/`

Self-contained modules that know nothing about the application. A lib module
knows only its own subject and could in principle be extracted as a standalone
package. It does not know it is part of a CLI and does not reach into commands
or app state; callers pass in what it needs.

### `src/lib/prismic/`

Prismic-domain logic shared by multiple commands. Still application-unaware.

### `src/lib/prismic/clients/`

One file per backend service. Network calls only: build the request, validate
the response, return typed data. No orchestration, no business decisions, no
console output.

## `src/adapters/`

Framework-specific integrations. One file per framework, with a sibling
`*.templates.ts` file for generated file content.

## `src/subprocesses/`

Entry scripts for detached background work. Minimal: parse input, call one
function, exit quietly.

## `test/`

End-to-end tests organized by command, mirroring `src/commands/` filenames
one-to-one: `repo-create.test.ts` tests `repo-create.ts`. Never organized by
feature or concern. Non-test files are shared helpers; helpers never import
from `src/`.

## `evals/`

AI agent evaluations. One `*.eval.ts` file per agent capability, named as a
behavior phrase like `sync-models.eval.ts`. Organized by what an agent should
be able to do, not by command. Non-eval files are the shared harness; eval
files may reuse `test/` helpers.
