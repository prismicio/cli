import {
	buildCustomType,
	buildSlice,
	it,
	readLocalCustomType,
	readLocalSlice,
	writeLocalCustomType,
	writeLocalSlice,
} from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "timestamp", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add timestamp <id> [options]");
});

it("adds a timestamp field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"timestamp",
		"my_timestamp",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_timestamp");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_timestamp;
	expect(field).toMatchObject({ type: "Timestamp" });
});

it("adds a timestamp field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"timestamp",
		"my_timestamp",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_timestamp");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.my_timestamp;
	expect(field).toMatchObject({ type: "Timestamp" });
});
