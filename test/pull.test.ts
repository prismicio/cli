import { pascalCase } from "change-case";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { x } from "tinyexec";
import { describe } from "vitest";

import { buildCustomType, buildSlice, it, scramble } from "./it";
import {
	deleteCustomType,
	deleteSlice,
	getCustomTypes,
	getSlices,
	insertCustomType,
	insertSlice,
} from "./prismic";

it.sequential("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("pull", ["--help"]);
	expect(exitCode, stderr).toBe(0);
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

	const { stderr, exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode, stderr).toBe(0);

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

	const { stderr, exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode, stderr).toBe(0);

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
	expect(first.exitCode, first.stderr).toBe(0);
	await expect(project).toContainSlice(sliceA);

	// Insert a second slice remotely
	const sliceB = buildSlice();
	await insertSlice(sliceB, { repo, token, host });
	await expect
		.poll(async () => (await getSlices({ repo, token, host })).map((s) => s.id), { timeout: 5_000 })
		.toContain(sliceB.id);

	// Second pull — should add slice B without breaking slice A
	const second = await prismic("pull", ["--repo", repo]);
	expect(second.exitCode, second.stderr).toBe(0);
	await expect(project).toContainSlice(sliceA);
	await expect(project).toContainSlice(sliceB);
});

it.sequential("pulls new slices into the first configured library", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const slice = buildSlice();

	await writeFile(
		new URL("prismic.config.json", project),
		JSON.stringify({
			repositoryName: repo,
			libraries: ["./slices/blog", "./slices/features"],
		}),
	);

	await insertSlice(slice, { repo, token, host });

	const { stderr, exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode, stderr).toBe(0);

	const sliceDirectoryName = pascalCase(slice.name);
	await expect(project).toContainSlice(slice);
	await expect(project).toHaveFile(`slices/blog/${sliceDirectoryName}/model.json`);
	await expect(project).not.toHaveFile(`slices/${sliceDirectoryName}/model.json`);
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
	expect(first.exitCode, first.stderr).toBe(0);
	await expect(project).toContainSlice(sliceA);
	await expect(project).toContainSlice(sliceB);

	// Delete slice B from remote
	await deleteSlice(sliceB.id, { repo, token, host });
	await expect
		.poll(async () => (await getSlices({ repo, token, host })).map((s) => s.id), { timeout: 5_000 })
		.not.toContain(sliceB.id);

	// Second pull — deletes local slice B to match remote
	const second = await prismic("pull", ["--repo", repo, "--force"]);
	expect(second.exitCode, second.stderr).toBe(0);
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

	const { stderr, exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode, stderr).toBe(0);

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

	const { stderr, exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode, stderr).toBe(0);

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

	const { stderr, exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode, stderr).toBe(0);

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
	expect(first.exitCode, first.stderr).toBe(0);
	await expect(project).toHaveRoute({ type: customType.id });

	await deleteCustomType(customType.id, { repo, token, host });
	await expect
		.poll(async () => (await getCustomTypes({ repo, token, host })).map((ct) => ct.id), {
			timeout: 5_000,
		})
		.not.toContain(customType.id);

	// Second pull — deletes local type to match remote
	const second = await prismic("pull", ["--repo", repo, "--force"]);
	expect(second.exitCode, second.stderr).toBe(0);
	await expect(project).not.toHaveRoute({ type: customType.id });
});

describe("with an isolated repository", () => {
	it.scoped({ isolateRepo: true });

	it("writes canonical model files that later pulls leave untouched", async ({
		expect,
		project,
		prismic,
		repo,
		token,
		host,
	}) => {
		// Nested config objects with unsorted keys, plus field maps (tab, group,
		// slice primary) whose entry order must be kept as-is.
		const customType = buildCustomType({
			json: {
				Main: {
					social_image: {
						type: "Image",
						config: {
							label: "Social image",
							constraint: { width: 1200, height: 630 },
							thumbnails: [{ name: "small", width: 100, height: 50 }],
						},
					},
					links: {
						type: "Group",
						config: {
							label: "Links",
							fields: {
								url: { type: "Text", config: { label: "URL", placeholder: "" } },
								label: { type: "Text", config: { label: "Label", placeholder: "" } },
							},
						},
					},
				},
			},
		} as Partial<ReturnType<typeof buildCustomType>>);
		const slice = buildSlice();
		slice.variations[0].primary = {
			title: { type: "Text", config: { placeholder: "Enter a title", label: "Title" } },
			subtitle: { type: "Text", config: { placeholder: "Enter a subtitle", label: "Subtitle" } },
		};

		await Promise.all([
			insertCustomType(customType, { repo, token, host }),
			insertSlice(slice, { repo, token, host }),
		]);

		const first = await prismic("pull", ["--repo", repo]);
		expect(first.exitCode, first.stderr).toBe(0);

		const typePath = new URL(`customtypes/${customType.id}/index.json`, project);
		const slicePath = new URL(`slices/${pascalCase(slice.name)}/model.json`, project);
		const pulledType = await readFile(typePath, "utf8");
		const pulledSlice = await readFile(slicePath, "utf8");

		// Metadata and config keys are sorted; field order is kept.
		const writtenType = JSON.parse(pulledType);
		expect(Object.keys(writtenType.json.Main)).toEqual(["social_image", "links"]);
		expect(Object.keys(writtenType.json.Main.social_image.config.constraint)).toEqual([
			"height",
			"width",
		]);
		expect(Object.keys(writtenType.json.Main.links.config.fields)).toEqual(["url", "label"]);
		const writtenSlice = JSON.parse(pulledSlice);
		expect(Object.keys(writtenSlice.variations[0].primary)).toEqual(["title", "subtitle"]);

		// A second pull with no changes on either side must not touch the files.
		const second = await prismic("pull", ["--repo", repo]);
		expect(second.exitCode, second.stderr).toBe(0);
		expect(second.stdout).toContain("Already up to date.");
		expect(await readFile(typePath, "utf8")).toBe(pulledType);
		expect(await readFile(slicePath, "utf8")).toBe(pulledSlice);

		// Files with non-canonical key order count as updates. This project has
		// no git repo to protect local edits, so a plain pull refuses; --force
		// writes the files back in canonical form.
		const scrambledType = JSON.stringify(scramble(JSON.parse(pulledType)), null, 2);
		const scrambledSlice = JSON.stringify(scramble(JSON.parse(pulledSlice)), null, 2);
		expect(scrambledType).not.toBe(pulledType);
		expect(scrambledSlice).not.toBe(pulledSlice);
		await writeFile(typePath, scrambledType);
		await writeFile(slicePath, scrambledSlice);

		const blocked = await prismic("pull", ["--repo", repo]);
		expect(blocked.exitCode).toBe(1);
		expect(blocked.stderr).toContain("--force");

		const rewrite = await prismic("pull", ["--repo", repo, "--force"]);
		expect(rewrite.exitCode, rewrite.stderr).toBe(0);
		expect(rewrite.stdout).toContain("updated 1, deleted 0 types");
		expect(rewrite.stdout).toContain("updated 1, deleted 0 slices");
		expect(await readFile(typePath, "utf8")).toBe(pulledType);
		expect(await readFile(slicePath, "utf8")).toBe(pulledSlice);
	});
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
	expect(first.exitCode, first.stderr).toBe(0);

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
	expect(second.stderr).toContain(`customtypes/${customType.id}/index.json`.replaceAll("/", sep));
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
	expect(first.exitCode, first.stderr).toBe(0);
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

	const { stderr, exitCode } = await prismic("pull", ["--repo", repo]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile(`app/${expectedSegment}/page.jsx`, {
		contains: originalContent,
	});
});
