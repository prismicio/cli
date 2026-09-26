import { mkdir, writeFile } from "node:fs/promises";
import { sep } from "node:path";

import { describe } from "vitest";

import { buildCustomType, buildSlice, captureOutput, it } from "./it";
import { insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("sync", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic sync [options]");
});

it("requires --watch", async ({ expect, prismic, repo }) => {
	const { exitCode, stderr } = await prismic("sync", ["--repo", repo]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("--watch");
});

describe("with an isolated repository", () => {
	it.scoped({ isolateRepo: true });

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

		const outputLengthBeforeSliceB = output().length;
		const newOutput = () => output().slice(outputLengthBeforeSliceB);
		const sliceB = buildSlice();
		await insertSlice(sliceB, { repo, token, host });

		await expect.poll(newOutput, { timeout: 30_000 }).toContain("Changes detected in slices");
		expect(newOutput()).not.toContain("custom types");
		await expect(project).toContainSlice(sliceB);
	}, 60_000);

	it("keeps an existing page file", async ({ expect, project, prismic, repo, token, host }) => {
		const customType = buildCustomType({ format: "page", repeatable: false });
		await insertCustomType(customType, { repo, token, host });
		const path = `app/${customType.id.toLowerCase()}/page.jsx`;
		await mkdir(new URL(".", new URL(path, project)), { recursive: true });
		await writeFile(new URL(path, project), "// existing page");

		const proc = prismic("sync", ["--repo", repo, "--watch"]);
		const output = captureOutput(proc);

		await expect.poll(output, { timeout: 30_000 }).toContain("Initial sync complete.");
		expect(output()).toContain(
			`Skipped ${path.replaceAll("/", sep)} (already exists). Run \`prismic gen page ${customType.id}\` to get the code.`,
		);
		await expect(project).toHaveFile(path, { contains: "// existing page" });
	}, 60_000);
});
