import { buildSlice, it, readLocalSlice, writeLocalSlice } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("slice", ["remove", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic slice remove <id> [options]");
});

it("shows the AGENTS text in help only when an agent is detected", async ({ expect, prismic }) => {
	const agentHelp = (
		await prismic("slice", ["remove", "--help"], {
			nodeOptions: { env: { AI_AGENT: "test-agent" } },
		})
	).stdout;
	const humanHelp = (await prismic("slice", ["remove", "--help"])).stdout;
	expect(agentHelp).toContain("asked to force it, ask before you run it.");
	expect(agentHelp.indexOf("asked to force it, ask before you run it.")).toBeLessThan(
		agentHelp.indexOf("USAGE"),
	);
	expect(humanHelp).not.toContain("AGENTS");
	expect(humanHelp).not.toContain("asked to force it, ask before you run it.");
});

it("removes a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, stderr, exitCode } = await prismic("slice", ["remove", slice.id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Slice removed: ${slice.id}`);

	const removed = await readLocalSlice(project, slice.id);
	expect(removed).toBeUndefined();
});
