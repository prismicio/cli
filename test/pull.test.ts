import { writeFile, mkdir } from "node:fs/promises";

import { buildCustomType, buildSlice, it, writeLocalCustomType } from "./it";
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

	// Second pull — destructive (deletes local slice B), requires --force
	const second = await prismic("pull", ["--repo", repo, "--force"]);
	expect(second.exitCode).toBe(0);
	await expect(project).toContainSlice(sliceA);
	await expect(project).not.toContainSlice(sliceB);
});

it.sequential("refuses on local drift without --force", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType({ label: "Original" });
	await insertCustomType(customType, { repo, token, host });

	// First pull — establishes the snapshot.
	const first = await prismic("pull", ["--repo", repo]);
	expect(first.exitCode).toBe(0);
	await expect(project).toContainCustomType(customType);

	// Edit the local file so it diverges from the snapshot.
	await writeLocalCustomType(project, { ...customType, label: "Modified" });

	const { exitCode, stderr } = await prismic("pull", ["--repo", repo]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("local changes that haven't been pushed");
	expect(stderr).toContain("--force");
});

it.sequential("refuses without --force when no snapshot exists and local diverges from remote", async ({
	expect,
	project,
	prismic,
	repo,
}) => {
	// No prior pull, no remote types. Local has a model — counts as drift
	// against the empty just-fetched remote.
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { exitCode, stderr } = await prismic("pull", ["--repo", repo]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("local changes that haven't been pushed");
	expect(stderr).toContain("--force");
});

it.sequential("pulls repeatable page type", async ({ expect, project, prismic, repo, token, host }) => {
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

it.sequential("pulls non-repeatable page type", async ({ expect, project, prismic, repo, token, host }) => {
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

it.sequential("pulls non-page custom type", async ({ expect, project, prismic, repo, token, host }) => {
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

	// Second pull — destructive (deletes local type), requires --force
	const second = await prismic("pull", ["--repo", repo, "--force"]);
	expect(second.exitCode).toBe(0);
	await expect(project).not.toHaveRoute({ type: customType.id });
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
