import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { x } from "tinyexec";

import { buildCustomType, buildSlice, it } from "./it";
import {
	deleteCustomType,
	deleteSlice,
	getCustomTypes,
	getSlices,
	insertCustomType,
	insertSlice,
} from "./prismic";

it.sequential("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("pull", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic pull [options]");
});

it.sequential("rejects an unknown --env", async ({ expect, prismic, repo }) => {
	const { stderr, exitCode } = await prismic("pull", ["--repo", repo, "--env", "does-not-exist"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(`Environment "does-not-exist" not found on repository "${repo}".`);
});

it.sequential("pulls slices and custom types from remote", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType();
	const slice = buildSlice();

	await Promise.all([
		insertCustomType(customType, { repo, token, host }),
		insertSlice(slice, { repo, token, host }),
	]);

	const { exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode).toBe(0);

	await expect(project).toContainCustomType(customType);
	await expect(project).toContainSlice(slice);
});

it.sequential("pulls multiple slices with correct structure", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const sliceA = buildSlice();
	const sliceB = buildSlice();

	await Promise.all([
		insertSlice(sliceA, { repo, token, host }),
		insertSlice(sliceB, { repo, token, host }),
	]);

	const { exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode).toBe(0);

	await expect(project).toContainSlice(sliceA);
	await expect(project).toContainSlice(sliceB);
});

it.sequential("adds new slice to existing library on re-pull", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const sliceA = buildSlice();
	await insertSlice(sliceA, { repo, token, host });

	// First pull — creates slice A
	const first = await prismic("pull", ["--repo", repo]);
	expect(first.exitCode).toBe(0);
	await expect(project).toContainSlice(sliceA);

	// Insert a second slice remotely
	const sliceB = buildSlice();
	await insertSlice(sliceB, { repo, token, host });
	await expect
		.poll(async () => (await getSlices({ repo, token, host })).map((s) => s.id), { timeout: 5_000 })
		.toContain(sliceB.id);

	// Second pull — should add slice B without breaking slice A
	const second = await prismic("pull", ["--repo", repo]);
	expect(second.exitCode).toBe(0);
	await expect(project).toContainSlice(sliceA);
	await expect(project).toContainSlice(sliceB);
});

it.sequential("removes deleted slice and updates index on re-pull", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const sliceA = buildSlice();
	const sliceB = buildSlice();

	await Promise.all([
		insertSlice(sliceA, { repo, token, host }),
		insertSlice(sliceB, { repo, token, host }),
	]);

	// First pull — creates both slices
	const first = await prismic("pull", ["--repo", repo]);
	expect(first.exitCode).toBe(0);
	await expect(project).toContainSlice(sliceA);
	await expect(project).toContainSlice(sliceB);

	// Delete slice B from remote
	await deleteSlice(sliceB.id, { repo, token, host });
	await expect
		.poll(async () => (await getSlices({ repo, token, host })).map((s) => s.id), { timeout: 5_000 })
		.not.toContain(sliceB.id);

	// Second pull — deletes local slice B to match remote
	const second = await prismic("pull", ["--repo", repo, "--force"]);
	expect(second.exitCode).toBe(0);
	await expect(project).toContainSlice(sliceA);
	await expect(project).not.toContainSlice(sliceB);
});

it.sequential("pulls repeatable page type", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType({ format: "page", repeatable: true });
	await insertCustomType(customType, { repo, token, host });

	const { exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode).toBe(0);

	const expectedSegment = customType.id.replaceAll("_", "-").toLowerCase();
	await expect(project).toHaveRoute({ type: customType.id, path: `/${expectedSegment}/:uid` });
	await expect(project).toHaveFile(`app/${expectedSegment}/[uid]/page.jsx`, {
		contains: `getByUID("${customType.id}"`,
	});
});

it.sequential("pulls non-repeatable page type", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType({ format: "page", repeatable: false });
	await insertCustomType(customType, { repo, token, host });

	const { exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode).toBe(0);

	const expectedSegment = customType.id.replaceAll("_", "-").toLowerCase();
	await expect(project).toHaveRoute({ type: customType.id, path: `/${expectedSegment}` });
	await expect(project).toHaveFile(`app/${expectedSegment}/page.jsx`, {
		contains: `getSingle("${customType.id}"`,
	});
});

it.sequential("pulls non-page custom type", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const { exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode).toBe(0);

	const expectedSegment = customType.id.replaceAll("_", "-").toLowerCase();
	await expect(project).not.toHaveRoute({ type: customType.id });
	await expect(project).not.toHaveFile(`app/${expectedSegment}/page.jsx`);
});

it.sequential("removes route when page type is deleted", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType({ format: "page", repeatable: true });
	await insertCustomType(customType, { repo, token, host });

	// First pull — adds the route
	const first = await prismic("pull", ["--repo", repo]);
	expect(first.exitCode).toBe(0);
	await expect(project).toHaveRoute({ type: customType.id });

	await deleteCustomType(customType.id, { repo, token, host });
	await expect
		.poll(async () => (await getCustomTypes({ repo, token, host })).map((ct) => ct.id), {
			timeout: 5_000,
		})
		.not.toContain(customType.id);

	// Second pull — deletes local type to match remote
	const second = await prismic("pull", ["--repo", repo, "--force"]);
	expect(second.exitCode).toBe(0);
	await expect(project).not.toHaveRoute({ type: customType.id });
});

it.sequential("blocks pull when local model files have uncommitted changes", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const first = await prismic("pull", ["--repo", repo]);
	expect(first.exitCode).toBe(0);

	const cwd = fileURLToPath(project);
	await x("git", ["init", "-q", "-b", "main"], { nodeOptions: { cwd } });
	await x("git", ["config", "user.email", "test@example.com"], { nodeOptions: { cwd } });
	await x("git", ["config", "user.name", "Test"], { nodeOptions: { cwd } });
	await x("git", ["add", "."], { nodeOptions: { cwd } });
	await x("git", ["commit", "-q", "-m", "init"], { nodeOptions: { cwd } });

	const modelPath = new URL(`customtypes/${customType.id}/index.json`, project);
	await writeFile(modelPath, JSON.stringify({ ...customType, label: "Edited locally" }, null, 2));

	const second = await prismic("pull", ["--repo", repo]);
	expect(second.exitCode).toBe(1);
	expect(second.stderr).toContain("uncommitted");
	expect(second.stderr).toContain(`customtypes/${customType.id}/index.json`);
});

it.sequential("refuses to delete local models without --force when not tracked by git", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const sliceA = buildSlice();
	const sliceB = buildSlice();

	await Promise.all([
		insertSlice(sliceA, { repo, token, host }),
		insertSlice(sliceB, { repo, token, host }),
	]);

	const first = await prismic("pull", ["--repo", repo]);
	expect(first.exitCode).toBe(0);
	await expect(project).toContainSlice(sliceB);

	await deleteSlice(sliceB.id, { repo, token, host });
	await expect
		.poll(async () => (await getSlices({ repo, token, host })).map((s) => s.id), { timeout: 5_000 })
		.not.toContain(sliceB.id);

	const second = await prismic("pull", ["--repo", repo]);
	expect(second.exitCode).toBe(1);
	expect(second.stderr).toContain("--force");
	await expect(project).toContainSlice(sliceB);
});

it.sequential("does not overwrite existing page file", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType({ format: "page", repeatable: false });
	await insertCustomType(customType, { repo, token, host });

	// Create the page file manually before pulling
	const expectedSegment = customType.id.replaceAll("_", "-").toLowerCase();
	const pagePath = new URL(`app/${expectedSegment}/page.jsx`, project);
	const originalContent = "// existing page content";
	await mkdir(new URL(".", pagePath), { recursive: true });
	await writeFile(pagePath, originalContent);

	const { exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode).toBe(0);

	await expect(project).toHaveFile(`app/${expectedSegment}/page.jsx`, {
		contains: originalContent,
	});
});
