import type { DynamicCustomTypeModel, DynamicSlicesModel } from "@prismicio/types-internal";
import { describe } from "vitest";

import {
	buildLegacyCustomType,
	buildSlice,
	it,
	readLocalCustomType,
	readLocalSlice,
	writeLocalCustomType,
	writeLocalSlice,
} from "./it";
import { getCustomTypes, getSlices, insertCustomType } from "./prismic";

function getChoices(customType: DynamicCustomTypeModel) {
	return (customType.json.Main.body as DynamicSlicesModel).config!.choices!;
}

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("slice", ["upgrade-legacy", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic slice upgrade-legacy <id> [options]");
});

it("upgrades a legacy slice to a new slice", async ({ expect, prismic, project }) => {
	const customType = buildLegacyCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("slice", [
		"upgrade-legacy",
		"hero",
		"--from",
		customType.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain('Upgraded legacy slice "hero" to slice "hero"');
	expect(stdout).toContain("keep their shape");
	expect(stdout).toContain("2 legacy slices remain");

	const slice = await readLocalSlice(project, "hero");
	expect(slice).toMatchObject({
		id: "hero",
		type: "SharedSlice",
		name: "Hero",
		legacyPaths: { [`${customType.id}::body::hero`]: "default" },
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

it("upgrades group and single-field legacy slices", async ({ expect, prismic, project }) => {
	const customType = buildLegacyCustomType();
	await writeLocalCustomType(project, customType);

	const gallery = await prismic("slice", ["upgrade-legacy", "gallery", "--from", customType.id]);
	expect(gallery.exitCode, gallery.stderr).toBe(0);
	expect(gallery.stdout).toContain("`slice.value` moves to `slice.items`");

	const quote = await prismic("slice", ["upgrade-legacy", "quote", "--from", customType.id]);
	expect(quote.exitCode, quote.stderr).toBe(0);
	expect(quote.stdout).toContain("`slice.value` moves to `slice.primary.quote`");

	const gallerySlice = await readLocalSlice(project, "gallery");
	expect(gallerySlice!.variations[0].items).toEqual({
		caption: { type: "Text", config: { label: "Caption" } },
	});
	const quoteSlice = await readLocalSlice(project, "quote");
	expect(quoteSlice!.variations[0].primary).toEqual({
		quote: { type: "Text", config: { label: "Quote" } },
	});
});

it("converts an invalid legacy slice ID", async ({ expect, prismic, project }) => {
	const customType = buildLegacyCustomType();
	const choices = getChoices(customType);
	choices["Hero-Banner"] = choices.hero;
	delete choices.hero;
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("slice", [
		"upgrade-legacy",
		"Hero-Banner",
		"--from",
		customType.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain('`slice_type` becomes "hero_banner"');

	const slice = await readLocalSlice(project, "hero_banner");
	expect(slice!.legacyPaths).toEqual({ [`${customType.id}::body::Hero-Banner`]: "default" });
	expect(getChoices(await readLocalCustomType(project, customType.id)).hero_banner).toEqual({
		type: "SharedSlice",
	});
});

it("upgrades a legacy slice in another slice zone", async ({ expect, prismic, project }) => {
	const customType = buildLegacyCustomType();
	customType.json.Main = { page_slices: customType.json.Main.body };
	await writeLocalCustomType(project, customType);

	const missing = await prismic("slice", ["upgrade-legacy", "hero", "--from", customType.id]);
	expect(missing.exitCode).toBe(1);
	expect(missing.stderr).toContain('not found in the "body" slice zone');

	const { stderr, exitCode } = await prismic("slice", [
		"upgrade-legacy",
		"hero",
		"--from",
		customType.id,
		"--slice-zone",
		"page_slices",
	]);
	expect(exitCode, stderr).toBe(0);
	const slice = await readLocalSlice(project, "hero");
	expect(slice!.legacyPaths).toEqual({ [`${customType.id}::page_slices::hero`]: "default" });
});

it("asks how to upgrade when the slice exists", async ({ expect, prismic, project }) => {
	const first = buildLegacyCustomType();
	const second = buildLegacyCustomType();
	await writeLocalCustomType(project, first);
	await writeLocalCustomType(project, second);
	await prismic("slice", ["upgrade-legacy", "hero", "--from", first.id]);

	const { stderr, exitCode } = await prismic("slice", [
		"upgrade-legacy",
		"hero",
		"--from",
		second.id,
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Slice "hero" already exists. Ask the user');
	expect(stderr).toContain(`--from ${second.id} --to hero\n`);
	expect(stderr).toContain(`--from ${second.id} --to hero --variation default`);
	expect(stderr).toContain(`--from ${second.id} --to <new-slice-id>`);
});

it("merges a legacy slice into a variation with the same fields", async ({
	expect,
	prismic,
	project,
}) => {
	const first = buildLegacyCustomType();
	const second = buildLegacyCustomType();
	await writeLocalCustomType(project, first);
	await writeLocalCustomType(project, second);
	await prismic("slice", ["upgrade-legacy", "hero", "--from", first.id]);

	const { stdout, stderr, exitCode } = await prismic("slice", [
		"upgrade-legacy",
		"hero",
		"--from",
		second.id,
		"--to",
		"hero",
		"--variation",
		"default",
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain('Merged legacy slice "hero" into variation "default" of slice "hero"');

	const slice = await readLocalSlice(project, "hero");
	expect(slice!.variations).toHaveLength(1);
	expect(slice!.legacyPaths).toEqual({
		[`${first.id}::body::hero`]: "default",
		[`${second.id}::body::hero`]: "default",
	});
});

it("adds a legacy slice to an existing slice as a new variation", async ({
	expect,
	prismic,
	project,
}) => {
	const slice = buildSlice();
	const customType = buildLegacyCustomType();
	await writeLocalSlice(project, slice);
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("slice", [
		"upgrade-legacy",
		"hero",
		"--from",
		customType.id,
		"--to",
		slice.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain('as variation "hero"');

	const updated = await readLocalSlice(project, slice.id);
	expect(updated!.variations.map((v) => v.id)).toEqual(["default", "hero"]);
	expect(updated!.legacyPaths).toEqual({ [`${customType.id}::body::hero`]: "hero" });

	const choices = getChoices(await readLocalCustomType(project, customType.id));
	expect(Object.keys(choices)).toEqual([slice.id, "gallery", "quote"]);
});

it("upgrades a legacy slice to a slice with another ID", async ({ expect, prismic, project }) => {
	const customType = buildLegacyCustomType();
	await writeLocalCustomType(project, customType);

	const { stderr, exitCode } = await prismic("slice", [
		"upgrade-legacy",
		"hero",
		"--from",
		customType.id,
		"--to",
		"blog_hero",
	]);
	expect(exitCode, stderr).toBe(0);
	const slice = await readLocalSlice(project, "blog_hero");
	expect(slice).toMatchObject({
		name: "BlogHero",
		legacyPaths: { [`${customType.id}::body::hero`]: "default" },
	});
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
		"upgrade-legacy",
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

it("fails when the type is not found", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("slice", [
		"upgrade-legacy",
		"hero",
		"--from",
		"missing",
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Type "missing" not found.');
});

it("fails when the legacy slice is not found", async ({ expect, prismic, project }) => {
	const customType = buildLegacyCustomType();
	await writeLocalCustomType(project, customType);

	const { stderr, exitCode } = await prismic("slice", [
		"upgrade-legacy",
		"missing",
		"--from",
		customType.id,
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Legacy slice "missing" not found');
});

describe("with an isolated repository", () => {
	it.scoped({ isolateRepo: true });

	it("pushes an upgraded legacy slice", async ({ expect, prismic, repo, token, host }) => {
		const customType = buildLegacyCustomType();
		await insertCustomType(customType, { repo, token, host });

		const pull = await prismic("pull", ["--repo", repo]);
		expect(pull.exitCode, pull.stderr).toBe(0);

		const upgrade = await prismic("slice", ["upgrade-legacy", "hero", "--from", customType.id]);
		expect(upgrade.exitCode, upgrade.stderr).toBe(0);

		const push = await prismic("push", ["--repo", repo, "--force"]);
		expect(push.exitCode, push.stderr).toBe(0);

		const slices = await getSlices({ repo, token, host });
		expect(slices.find((slice) => slice.id === "hero")?.legacyPaths).toEqual({
			[`${customType.id}::body::hero`]: "default",
		});
		const remoteCustomType = (await getCustomTypes({ repo, token, host })).find(
			(ct) => ct.id === customType.id,
		)!;
		const choices = getChoices(remoteCustomType);
		expect(choices.hero).toEqual({ type: "SharedSlice" });
		expect(choices.gallery.type).toBe("Group");
	});
});
