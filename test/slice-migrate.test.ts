import type { DynamicCustomTypeModel, DynamicSlicesModel } from "@prismicio/types-internal";
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
import { getCustomTypes, getSlices, insertCustomType } from "./prismic";

function buildLegacyCustomType(): DynamicCustomTypeModel {
	return buildCustomType({
		format: "page",
		json: {
			Main: {
				slices: {
					type: "Slices",
					fieldset: "Slice Zone",
					config: {
						choices: {
							hero: {
								type: "Slice",
								fieldset: "Hero",
								"non-repeat": {
									title: { type: "StructuredText", config: { label: "Title", single: "heading1" } },
								},
								repeat: { label: { type: "Text", config: { label: "Label" } } },
							},
							gallery: {
								type: "Group",
								fieldset: "Gallery",
								config: { fields: { caption: { type: "Text", config: { label: "Caption" } } } },
							},
							quote: { type: "Text", config: { label: "Quote" } },
						},
					},
				},
			},
		},
	});
}

function getChoices(customType: DynamicCustomTypeModel) {
	return (customType.json.Main.slices as DynamicSlicesModel).config!.choices!;
}

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("slice", ["migrate", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic slice migrate <id> [options]");
});

it("lists legacy slices", async ({ expect, prismic, project }) => {
	const customType = buildLegacyCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("slice", ["migrate"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`prismic slice migrate hero --from ${customType.id}`);
	expect(stdout).toContain(`prismic slice migrate gallery --from ${customType.id}`);
	expect(stdout).toContain(`prismic slice migrate quote --from ${customType.id}`);
});

it("suggests --to for a legacy slice ID used in two types", async ({
	expect,
	prismic,
	project,
}) => {
	const first = buildLegacyCustomType();
	const second = buildLegacyCustomType();
	await writeLocalCustomType(project, first);
	await writeLocalCustomType(project, second);

	const { stdout, stderr, exitCode } = await prismic("slice", ["migrate", "--json"]);
	expect(exitCode, stderr).toBe(0);
	const commands = (JSON.parse(stdout) as { command: string }[]).map((row) => row.command);
	expect(commands.filter((command) => command.startsWith("prismic slice migrate hero "))).toEqual(
		expect.arrayContaining([
			expect.not.stringContaining("--to"),
			expect.stringContaining("--to hero"),
		]),
	);
});

it("converts a legacy slice to a new shared slice", async ({ expect, prismic, project }) => {
	const customType = buildLegacyCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("slice", [
		"migrate",
		"hero",
		"--from",
		customType.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain('Created slice "hero" from legacy slice "hero"');
	expect(stdout).toContain("2 legacy slices remain");

	const slice = await readLocalSlice(project, "hero");
	expect(slice).toMatchObject({
		id: "hero",
		type: "SharedSlice",
		name: "Hero",
		legacyPaths: { [`${customType.id}::slices::hero`]: "default" },
	});
	expect(slice!.variations[0]).toMatchObject({
		id: "default",
		primary: { title: { type: "StructuredText" } },
		items: { label: { type: "Text" } },
	});

	const choices = getChoices(await readLocalCustomType(project, customType.id));
	expect(Object.keys(choices)).toEqual(["hero", "gallery", "quote"]);
	expect(choices.hero).toEqual({ type: "SharedSlice" });
	expect(choices.gallery.type).toBe("Group");
});

it("converts group and single-field legacy slices", async ({ expect, prismic, project }) => {
	const customType = buildLegacyCustomType();
	await writeLocalCustomType(project, customType);

	const gallery = await prismic("slice", ["migrate", "gallery", "--from", customType.id]);
	expect(gallery.exitCode, gallery.stderr).toBe(0);
	expect(gallery.stdout).toContain("move from `slice.value` to `slice.items`");

	const quote = await prismic("slice", ["migrate", "quote", "--from", customType.id]);
	expect(quote.exitCode, quote.stderr).toBe(0);
	expect(quote.stdout).toContain("moves from `slice.value` to `slice.primary.quote`");

	const gallerySlice = await readLocalSlice(project, "gallery");
	expect(gallerySlice!.variations[0].items).toEqual({
		caption: { type: "Text", config: { label: "Caption" } },
	});
	const quoteSlice = await readLocalSlice(project, "quote");
	expect(quoteSlice!.variations[0].primary).toEqual({
		quote: { type: "Text", config: { label: "Quote" } },
	});
});

it("merges a legacy slice into an identical variation", async ({ expect, prismic, project }) => {
	const first = buildLegacyCustomType();
	const second = buildLegacyCustomType();
	await writeLocalCustomType(project, first);
	await writeLocalCustomType(project, second);

	await prismic("slice", ["migrate", "hero", "--from", first.id]);
	const { stdout, stderr, exitCode } = await prismic("slice", [
		"migrate",
		"hero",
		"--from",
		second.id,
		"--to",
		"hero",
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain('Merged legacy slice "hero" into variation "default" of slice "hero"');

	const slice = await readLocalSlice(project, "hero");
	expect(slice!.variations).toHaveLength(1);
	expect(slice!.legacyPaths).toEqual({
		[`${first.id}::slices::hero`]: "default",
		[`${second.id}::slices::hero`]: "default",
	});
	expect(getChoices(await readLocalCustomType(project, second.id)).hero).toEqual({
		type: "SharedSlice",
	});
});

it("adds a legacy slice as a new variation", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	const customType = buildLegacyCustomType();
	await writeLocalSlice(project, slice);
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("slice", [
		"migrate",
		"hero",
		"--from",
		customType.id,
		"--to",
		slice.id,
		"--variation",
		"legacyHero",
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`as variation "legacyHero"`);

	const updated = await readLocalSlice(project, slice.id);
	expect(updated!.variations.map((v) => v.id)).toEqual(["default", "legacyHero"]);
	expect(updated!.legacyPaths).toEqual({ [`${customType.id}::slices::hero`]: "legacyHero" });

	const choices = getChoices(await readLocalCustomType(project, customType.id));
	expect(Object.keys(choices)).toEqual([slice.id, "gallery", "quote"]);
});

it("refuses to merge into a variation with different fields", async ({
	expect,
	prismic,
	project,
}) => {
	const slice = buildSlice();
	const customType = buildLegacyCustomType();
	await writeLocalSlice(project, slice);
	await writeLocalCustomType(project, customType);

	const { stderr, exitCode } = await prismic("slice", [
		"migrate",
		"hero",
		"--from",
		customType.id,
		"--to",
		slice.id,
		"--variation",
		"default",
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("has different fields");
});

it("fails when the shared slice ID is taken", async ({ expect, prismic, project }) => {
	const customType = buildLegacyCustomType();
	await writeLocalCustomType(project, customType);
	await writeLocalSlice(project, buildSlice({ id: "hero", name: "Hero" }));

	const { stderr, exitCode } = await prismic("slice", ["migrate", "hero", "--from", customType.id]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Slice "hero" already exists');
	expect(stderr).toContain("--to hero");
});

it("fails when the legacy slice is not found", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("slice", ["migrate", "missing"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Legacy slice "missing" not found');
});

describe("with an isolated repository", () => {
	it.scoped({ isolateRepo: true });

	it("pushes a converted legacy slice", async ({ expect, prismic, repo, token, host }) => {
		const customType = buildLegacyCustomType();
		await insertCustomType(customType, { repo, token, host });

		const pull = await prismic("pull", ["--repo", repo]);
		expect(pull.exitCode, pull.stderr).toBe(0);

		const migrate = await prismic("slice", ["migrate", "hero", "--from", customType.id]);
		expect(migrate.exitCode, migrate.stderr).toBe(0);

		const push = await prismic("push", ["--repo", repo, "--force"]);
		expect(push.exitCode, push.stderr).toBe(0);

		const slices = await getSlices({ repo, token, host });
		expect(slices.find((slice) => slice.id === "hero")?.legacyPaths).toEqual({
			[`${customType.id}::slices::hero`]: "default",
		});
		const remoteCustomType = (await getCustomTypes({ repo, token, host })).find(
			(ct) => ct.id === customType.id,
		)!;
		const choices = getChoices(remoteCustomType);
		expect(choices.hero).toEqual({ type: "SharedSlice" });
		expect(choices.gallery.type).toBe("Group");
	});
});
