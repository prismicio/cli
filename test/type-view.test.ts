import { buildCustomType, it } from "./it";
import { insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["view", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type view <name> [options]");
});

it("views a type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("type", ["view", customType.label!]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`ID: ${customType.id}`);
	expect(stdout).toContain(`Name: ${customType.label}`);
	expect(stdout).toContain("Format: custom");
	expect(stdout).toContain("Repeatable: true");
	expect(stdout).toContain("Tabs: Main");
});

it("views a type as JSON", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("type", ["view", customType.label!, "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toMatchObject({ id: customType.id, label: customType.label, format: "custom" });
});
