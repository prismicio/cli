import { pascalCase } from "change-case";
import { writeFile, mkdir } from "node:fs/promises";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { x } from "tinyexec";
import { describe } from "vitest";

import {
	buildCustomType,
	buildSlice,
	it,
	readLocalCustomType,
	readLocalSlice,
	writeLocalCustomType,
	writeLocalSlice,
} from "./it";
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
		const slice = buildSlice({ id: "zeta-slice", name: "ZetaSlice" });
		slice.variations[0].primary = {
			title: { type: "Text", config: { placeholder: "Enter a title", label: "Title" } },
			alignment: {
				type: "Select",
				config: {
					placeholder: "",
					label: "Alignment",
					options: ["right", "center", "left"],
					default_value: "left",
				},
			},
		};
		const customType = buildCustomType({
			format: "custom",
			json: {
				Main: {
					social_image: {
						type: "Image",
						config: {
							label: "Social image",
							constraint: { width: 1200, height: 630 },
							thumbnails: [
								{ name: "small", width: 100, height: 50 },
								{ name: "large", width: 400, height: 200 },
							],
						},
					},
					links: {
						type: "Group",
						config: {
							label: "Links",
							fields: {
								url: { type: "Text", config: { placeholder: "", label: "URL" } },
								label: { type: "Text", config: { placeholder: "", label: "Label" } },
							},
						},
					},
					slices: {
						type: "Slices",
						fieldset: "Slice Zone",
						config: {
							choices: {
								[slice.id]: { type: "SharedSlice" },
								legacy_banner: {
									type: "Slice",
									fieldset: "Legacy banner",
									"non-repeat": {
										title: { type: "Text", config: { placeholder: "", label: "Title" } },
										caption: { type: "Text", config: { placeholder: "", label: "Caption" } },
									},
								},
							},
						},
					},
				},
				Details: {
					author: { type: "Text", config: { label: "Author", placeholder: "" } },
				},
			},
		});

		await Promise.all([
			writeLocalCustomType(project, customType),
			writeLocalSlice(project, slice),
			insertCustomType(customType, { repo, token, host }),
			insertSlice(slice, { repo, token, host }),
		]);

		const first = await prismic("pull", ["--repo", repo, "--force"]);
		expect(first.exitCode, first.stderr).toBe(0);

		// oxlint-disable-next-line typescript-eslint/no-explicit-any
		const writtenType: Record<string, any> = await readLocalCustomType(project, customType.id);
		// oxlint-disable-next-line typescript-eslint/no-explicit-any
		const writtenSlice: Record<string, any> | undefined = await readLocalSlice(project, slice.id);
		if (!writtenSlice) throw new Error(`Slice "${slice.id}" was not pulled.`);

		expect(writtenType).toEqual(customType);
		expect(Object.keys(writtenType)).toEqual([
			"format",
			"id",
			"json",
			"label",
			"repeatable",
			"status",
		]);
		expect(Object.keys(writtenType.json)).toEqual(["Main", "Details"]);
		expect(Object.keys(writtenType.json.Main)).toEqual(["social_image", "links", "slices"]);
		expect(Object.keys(writtenType.json.Main.social_image.config)).toEqual([
			"constraint",
			"label",
			"thumbnails",
		]);
		expect(Object.keys(writtenType.json.Main.social_image.config.constraint)).toEqual([
			"height",
			"width",
		]);
		expect(Object.keys(writtenType.json.Main.social_image.config.thumbnails[0])).toEqual([
			"height",
			"name",
			"width",
		]);
		expect(Object.keys(writtenType.json.Main.links.config.fields)).toEqual(["url", "label"]);
		expect(Object.keys(writtenType.json.Main.links.config.fields.url.config)).toEqual([
			"label",
			"placeholder",
		]);
		expect(Object.keys(writtenType.json.Main.slices)).toEqual(["config", "fieldset", "type"]);

		const choices = writtenType.json.Main.slices.config.choices;
		expect(Object.keys(choices)).toEqual([slice.id, "legacy_banner"]);
		expect(Object.keys(choices.legacy_banner)).toEqual(["fieldset", "non-repeat", "type"]);
		expect(Object.keys(choices.legacy_banner["non-repeat"])).toEqual(["title", "caption"]);
		expect(Object.keys(choices.legacy_banner["non-repeat"].title.config)).toEqual([
			"label",
			"placeholder",
		]);

		expect(writtenSlice).toEqual(slice);
		expect(Object.keys(writtenSlice.variations[0])).toEqual([
			"description",
			"docURL",
			"id",
			"imageUrl",
			"name",
			"primary",
			"version",
		]);
		expect(Object.keys(writtenSlice.variations[0].primary)).toEqual(["title", "alignment"]);
		expect(Object.keys(writtenSlice.variations[0].primary.alignment.config)).toEqual([
			"default_value",
			"label",
			"options",
			"placeholder",
		]);
		expect(writtenSlice.variations[0].primary.alignment.config.options).toEqual([
			"right",
			"center",
			"left",
		]);

		const second = await prismic("pull", ["--repo", repo]);
		expect(second.exitCode, second.stderr).toBe(0);
		expect(second.stdout).toContain("Already up to date.");
		const typeAfter = await readLocalCustomType(project, customType.id);
		const sliceAfter = await readLocalSlice(project, slice.id);
		expect(JSON.stringify(typeAfter)).toBe(JSON.stringify(writtenType));
		expect(JSON.stringify(sliceAfter)).toBe(JSON.stringify(writtenSlice));
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
