import { buildCustomType, it } from "./it";
import { insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["view", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type view <id> [options]");
});

it("views a type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("type", ["view", customType.id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`ID: ${customType.id}`);
	expect(stdout).toContain(`Name: ${customType.label}`);
	expect(stdout).toContain("Format: custom");
	expect(stdout).toContain("Repeatable: true");
	expect(stdout).toContain("Main:");
});

it("shows fields per tab", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({
		json: {
			Main: {
				title: { type: "StructuredText", config: { label: "Title", placeholder: "Enter title" } },
				is_active: { type: "Boolean", config: { label: "Is Active" } },
			},
			SEO: {
				meta_title: { type: "Text", config: { label: "Meta Title" } },
			},
		},
	});
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("type", ["view", customType.id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Main:");
	expect(stdout).toContain("title  StructuredText  Title");
	expect(stdout).toContain('"Enter title"');
	expect(stdout).toContain("is_active  Boolean  Is Active");
	expect(stdout).toContain("SEO:");
	expect(stdout).toContain("meta_title  Text  Meta Title");
});

it("views a type as JSON", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("type", ["view", customType.id, "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toMatchObject({ id: customType.id, label: customType.label, format: "custom" });
});
