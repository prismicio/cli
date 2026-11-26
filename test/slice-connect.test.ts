import type { DynamicSlicesModel } from "@prismicio/types-internal";

import {
	buildCustomType,
	buildSlice,
	it,
	readLocalCustomType,
	writeLocalCustomType,
	writeLocalSlice,
} from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("slice", ["connect", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic slice connect <id...> [options]");
});

it("connects a slice to a type", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	const customType = buildCustomType({
		format: "page",
		json: {
			Main: {
				slices: {
					type: "Slices",
					fieldset: "Slice Zone",
					config: { choices: {} },
				},
			},
		},
	});

	await writeLocalSlice(project, slice);
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("slice", [
		"connect",
		slice.id,
		"--to",
		customType.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Connected slice "${slice.id}" to "${customType.id}"`);

	const updated = await readLocalCustomType(project, customType.id);
	const choices = (updated.json.Main.slices as DynamicSlicesModel).config!.choices!;
	expect(choices[slice.id]).toEqual({ type: "SharedSlice" });
});

it("says how to add a slice zone when the type has none", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	const customType = buildCustomType();

	await writeLocalSlice(project, slice);
	await writeLocalCustomType(project, customType);

	const { stderr, exitCode } = await prismic("slice", ["connect", slice.id, "--to", customType.id]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(
		`"${customType.id}" has no slice zone. Add one with \`prismic type edit-tab "Main" --from-type ${customType.id} --with-slice-zone\`, then run this command again.`,
	);
});

it("lists the slice zones when --slice-zone matches none", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	const customType = buildCustomType({
		json: { Main: { body: { type: "Slices", config: { choices: {} } } } },
	});

	await writeLocalSlice(project, slice);
	await writeLocalCustomType(project, customType);

	const { stderr, exitCode } = await prismic("slice", ["connect", slice.id, "--to", customType.id]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(
		`Slice zone "slices" not found in "${customType.id}". Use --slice-zone with one of: body.`,
	);
});

it("connects several slices to a type", async ({ expect, prismic, project }) => {
	const hero = buildSlice();
	const features = buildSlice();
	const customType = buildCustomType({
		format: "page",
		json: { Main: { slices: { type: "Slices", config: { choices: {} } } } },
	});

	await writeLocalSlice(project, hero);
	await writeLocalSlice(project, features);
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("slice", [
		"connect",
		hero.id,
		features.id,
		"--to",
		customType.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Connected slice "${hero.id}" to "${customType.id}"`);
	expect(stdout).toContain(`Connected slice "${features.id}" to "${customType.id}"`);

	const updated = await readLocalCustomType(project, customType.id);
	expect((updated.json.Main.slices as DynamicSlicesModel).config!.choices).toEqual({
		[hero.id]: { type: "SharedSlice" },
		[features.id]: { type: "SharedSlice" },
	});
});

it("connects no slice when one is already connected", async ({ expect, prismic, project }) => {
	const hero = buildSlice();
	const features = buildSlice();
	const customType = buildCustomType({
		format: "page",
		json: {
			Main: {
				slices: { type: "Slices", config: { choices: { [features.id]: { type: "SharedSlice" } } } },
			},
		},
	});

	await writeLocalSlice(project, hero);
	await writeLocalSlice(project, features);
	await writeLocalCustomType(project, customType);

	const { stderr, exitCode } = await prismic("slice", [
		"connect",
		hero.id,
		features.id,
		"--to",
		customType.id,
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(
		`Slice "${features.id}" is already connected to "${customType.id}" in slice zone "slices".`,
	);

	const updated = await readLocalCustomType(project, customType.id);
	expect((updated.json.Main.slices as DynamicSlicesModel).config!.choices).toEqual({
		[features.id]: { type: "SharedSlice" },
	});
});
