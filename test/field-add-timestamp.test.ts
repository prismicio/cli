import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, getSlices, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "timestamp", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add timestamp <id> [options]");
});

it("adds a timestamp field to a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"timestamp",
		"my_timestamp",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_timestamp");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.my_timestamp;
	expect(field).toMatchObject({ type: "Timestamp" });
});

it("adds a timestamp field to a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"timestamp",
		"my_timestamp",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_timestamp");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	const field = updated!.json.Main.my_timestamp;
	expect(field).toMatchObject({ type: "Timestamp" });
});
