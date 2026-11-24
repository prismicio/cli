- Make the smallest change that does the task. No refactors, speculative changes, or new abstractions.
- Prefer a good default to a new option, and a native API to a custom helper.
- Keep logic at its call site. Move it to a shared module only when a second caller needs it.
- Don't add runtime dependencies. If you think one is needed, ask a human.
- Avoid comments. Add one only when the code can't explain a non-obvious why. Never describe what the code does, what changed, or how it used to work.
- Test against a real Prismic repository with the Vitest tests in `test/`, not a mocked backend. These tests need `E2E_PRISMIC_EMAIL` and `E2E_PRISMIC_PASSWORD`.
- Assert what a user would see, not the calls made to get there. A refactor should pass without editing tests.
- Write unit tests only for edge cases end-to-end tests can't reach.
- PRs are squash-merged and Release Please builds the changelog from the PR title. Use a Conventional Commits PR title.
- In the PR description, explain why the change is needed: the goal or context the code can't show. Don't summarize the diff; reviewers can read it.
- Don't edit `version` or `CHANGELOG.md`. Release Please owns them.

# File Organization

Rules for where code goes in this repository. They describe the kind of code
each place holds, not the contents of specific files. Follow them when adding,
moving, or reviewing code.

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

### `src/lib/prismic/client.ts`

Every request to a Prismic backend service, in one file grouped by service.
Network calls only: build the request, validate the response, return typed
data. No orchestration, no business decisions, no console output.

## `src/adapters/`

Framework-specific integrations. One file per framework, with a sibling
`*.templates.ts` file for generated file content. When an older framework major
needs different generated code, it gets its own adapter that extends the current
one, such as `sveltekit2.ts`. Delete it when support for that major ends.

## `src/subprocesses/`

Entry scripts for detached background work. Minimal: parse input, call one
function, exit quietly.

## `test/`

End-to-end tests organized by command, mirroring `src/commands/` filenames
one-to-one: `repo-create.test.ts` tests `repo-create.ts`. Never organized by
feature or concern. Non-test files are shared helpers; helpers never import
from `src/`.
