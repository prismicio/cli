import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { captureOutput, it } from "./it";
import { deleteCustomType, deleteSlice, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("sync", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic sync [options]");
});

it("syncs slices and custom types from remote", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType();
	const slice = buildSlice();

	await insertCustomType(customType, { repo, token, host });
	await insertSlice(slice, { repo, token, host });

	const { exitCode } = await prismic("sync", ["--repo", repo]);
	expect(exitCode).toBe(0);

	await expect(project).toContainCustomType(customType);
	await expect(project).toContainSlice(slice);
}, 60_000);

it("syncs multiple slices with correct structure", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const sliceA = buildSlice();
	const sliceB = buildSlice();

	await insertSlice(sliceA, { repo, token, host });
	await insertSlice(sliceB, { repo, token, host });

	const { exitCode } = await prismic("sync", ["--repo", repo]);
	expect(exitCode).toBe(0);

	await expect(project).toContainSlice(sliceA);
	await expect(project).toContainSlice(sliceB);
}, 60_000);

it("adds new slice to existing library on re-sync", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const sliceA = buildSlice();
	await insertSlice(sliceA, { repo, token, host });

	// First sync — creates slice A
	const first = await prismic("sync", ["--repo", repo]);
	expect(first.exitCode).toBe(0);
	await expect(project).toContainSlice(sliceA);

	// Insert a second slice remotely
	const sliceB = buildSlice();
	await insertSlice(sliceB, { repo, token, host });

	// Second sync — should add slice B without breaking slice A
	const second = await prismic("sync", ["--repo", repo]);
	expect(second.exitCode).toBe(0);
	await expect(project).toContainSlice(sliceA);
	await expect(project).toContainSlice(sliceB);
}, 60_000);

it("removes deleted slice and updates index on re-sync", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const sliceA = buildSlice();
	const sliceB = buildSlice();

	await insertSlice(sliceA, { repo, token, host });
	await insertSlice(sliceB, { repo, token, host });

	// First sync — creates both slices
	const first = await prismic("sync", ["--repo", repo]);
	expect(first.exitCode).toBe(0);
	await expect(project).toContainSlice(sliceA);
	await expect(project).toContainSlice(sliceB);

	// Delete slice B from remote
	await deleteSlice(sliceB.id, { repo, token, host });

	// Second sync — should remove slice B and update the index
	const second = await prismic("sync", ["--repo", repo]);
	expect(second.exitCode).toBe(0);
	await expect(project).toContainSlice(sliceA);
	await expect(project).not.toContainSlice(sliceB);
}, 60_000);

it("watches for changes and syncs", async ({ expect, project, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	const slice = buildSlice();

	const proc = prismic("sync", ["--repo", repo, "--watch"]);
	const output = captureOutput(proc);

	await expect.poll(output, { timeout: 30_000 }).toContain("Watching for changes");

	await insertCustomType(customType, { repo, token, host });
	await insertSlice(slice, { repo, token, host });

	await expect.poll(output, { timeout: 30_000 }).toContain("Changes detected");

	await expect(project).toContainCustomType(customType);
	await expect(project).toContainSlice(slice);
}, 60_000);

it("adds route for synced page type", async ({ expect, project, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "page", repeatable: true });
	await insertCustomType(customType, { repo, token, host });

	const { exitCode } = await prismic("sync", ["--repo", repo]);
	expect(exitCode).toBe(0);

	const expectedSegment = customType.id.replaceAll("_", "-").toLowerCase();
	await expect(project).toHaveRoute({ type: customType.id, path: `/${expectedSegment}/:uid` });
}, 60_000);

it("adds route without :uid for non-repeatable page type", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType({ format: "page", repeatable: false });
	await insertCustomType(customType, { repo, token, host });

	const { exitCode } = await prismic("sync", ["--repo", repo]);
	expect(exitCode).toBe(0);

	const expectedSegment = customType.id.replaceAll("_", "-").toLowerCase();
	await expect(project).toHaveRoute({ type: customType.id, path: `/${expectedSegment}` });
}, 60_000);

it("does not add route for non-page custom type", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const { exitCode } = await prismic("sync", ["--repo", repo]);
	expect(exitCode).toBe(0);
	await expect(project).not.toHaveRoute({ type: customType.id });
}, 60_000);

it("removes route when page type is deleted", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType({ format: "page", repeatable: true });
	await insertCustomType(customType, { repo, token, host });

	// First sync — adds the route
	const first = await prismic("sync", ["--repo", repo]);
	expect(first.exitCode).toBe(0);
	await expect(project).toHaveRoute({ type: customType.id });

	await deleteCustomType(customType.id, { repo, token, host });

	// Second sync — removes the route
	const second = await prismic("sync", ["--repo", repo]);
	expect(second.exitCode).toBe(0);
	await expect(project).not.toHaveRoute({ type: customType.id });
}, 60_000);

function buildCustomType(overrides?: Partial<CustomType>): CustomType {
	const id = crypto.randomUUID().split("-")[0];
	return {
		id: `type-T${id}`,
		label: `TypeT${id}`,
		repeatable: true,
		status: true,
		json: {},
		...overrides,
	};
}

function buildSlice(): SharedSlice {
	const id = crypto.randomUUID().split("-")[0];
	return {
		id: `slice-S${id}`,
		type: "SharedSlice",
		name: `SliceS${id}`,
		variations: [
			{
				id: "default",
				name: "Default",
				docURL: "",
				version: "initial",
				description: "Default",
				imageUrl: "",
			},
		],
	};
}
