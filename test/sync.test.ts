import { buildCustomType, buildSlice, captureOutput, it } from "./it";
import { insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("sync", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic sync [options]");
});

it("requires --watch", async ({ expect, prismic, repo }) => {
	const { exitCode, stderr } = await prismic("sync", ["--repo", repo]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("--watch");
});

it("watches for changes and syncs", async ({ expect, project, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	const slice = buildSlice();

	const proc = prismic("sync", ["--repo", repo, "--watch"]);
	const output = captureOutput(proc);

	await expect.poll(output, { timeout: 30_000 }).toContain("Initial sync complete.");

	await Promise.all([
		insertCustomType(customType, { repo, token, host }),
		insertSlice(slice, { repo, token, host }),
	]);

	await expect.poll(output, { timeout: 30_000 }).toContain("Changes detected");

	await expect(project).toContainCustomType(customType);
	await expect(project).toContainSlice(slice);
}, 60_000);
