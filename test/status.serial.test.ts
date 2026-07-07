import { buildCustomType, buildSlice, it, readLocalCustomType, writeLocalCustomType } from "./it";
import { insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("status", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic status [options]");
});

it("reports in-sync when local matches remote", async ({ expect, prismic, repo }) => {
	const pull = await prismic("pull", ["--repo", repo]);
	expect(pull.exitCode).toBe(0);

	const { stdout, exitCode } = await prismic("status", ["--repo", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Repository: ${repo}`);
	expect(stdout).toContain("Already up to date.");
});

it("reports local-only models when added locally but not pushed", async ({
	expect,
	project,
	prismic,
	repo,
}) => {
	const pull = await prismic("pull", ["--repo", repo]);
	expect(pull.exitCode).toBe(0);

	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("status", ["--repo", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Local-only:");
	expect(stdout).toContain(`${customType.id} (custom type)`);
	expect(stdout).toContain("Next:");
	expect(stdout).toContain("prismic push");
});

it("reports remote-only models when added remotely but not pulled", async ({
	expect,
	prismic,
	repo,
	token,
	host,
}) => {
	const pull = await prismic("pull", ["--repo", repo]);
	expect(pull.exitCode).toBe(0);

	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("status", ["--repo", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Remote-only:");
	expect(stdout).toContain(`${slice.id} (slice)`);
	expect(stdout).toContain("prismic pull");
});

it("rejects an unknown --env", async ({ expect, prismic, repo }) => {
	const { stderr, exitCode } = await prismic("status", ["--repo", repo, "--env", "does-not-exist"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(`No environments available on repository "${repo}".`);
});

it("warns and skips --env when not logged in", async ({ expect, prismic, logout, repo }) => {
	await logout();
	const { stdout, exitCode } = await prismic("status", ["--repo", repo, "--env", "anything"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Repository: ${repo}`);
	expect(stdout).toContain("Environment: anything");
});

it("reports in-sync when local only reorders metadata and config keys", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	// A field with multiple config keys, so config key order can be reordered.
	const customType = buildCustomType({
		json: {
			Main: {
				title: { type: "Text", config: { label: "Title", placeholder: "Enter a title" } },
			},
		},
	} as Partial<ReturnType<typeof buildCustomType>>);
	await insertCustomType(customType, { repo, token, host });

	// Pull writes the canonical form to disk.
	const pull = await prismic("pull", ["--repo", repo]);
	expect(pull.exitCode).toBe(0);

	// Hand-edit the local file: reverse the order of metadata keys and of each
	// field's config keys, leaving all values and the field order unchanged.
	const pulled = await readLocalCustomType(project, customType.id);
	// Pull writes the canonical (sorted-key) form, not the raw API key order.
	expect(Object.keys(pulled)).toEqual(Object.keys(pulled).sort());
	const canonical = JSON.stringify(pulled, null, 2);
	for (const fields of Object.values(pulled.json)) {
		for (const field of Object.values(fields)) {
			const f = field as { config?: Record<string, unknown> };
			if (f.config) {
				expect(Object.keys(f.config)).toEqual(Object.keys(f.config).sort());
				f.config = Object.fromEntries(Object.entries(f.config).reverse());
			}
		}
	}
	const scrambled = Object.fromEntries(Object.entries(pulled).reverse()) as typeof pulled;
	// Confirm the hand-edit really produced a non-canonical file.
	expect(JSON.stringify(scrambled, null, 2)).not.toBe(canonical);
	await writeLocalCustomType(project, scrambled);

	// Both sides canonicalize equal, so status must report no changes.
	const { stdout, exitCode } = await prismic("status", ["--repo", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Already up to date.");
});

it("reports differing models when local and remote disagree", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType({ label: "Original" });
	await insertCustomType(customType, { repo, token, host });

	const pull = await prismic("pull", ["--repo", repo]);
	expect(pull.exitCode).toBe(0);

	await writeLocalCustomType(project, { ...customType, label: "Modified" });

	const { stdout, exitCode } = await prismic("status", ["--repo", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Differ:");
	expect(stdout).toContain(`${customType.id} (custom type)`);
});
