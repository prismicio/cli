import { buildCustomType, buildSlice, it, writeLocalCustomType } from "./it";
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
