import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { buildSlice, it, readLocalSlice, writeLocalSlice } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["add-variation", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice add-variation <name> [options]");
});

it("adds a variation to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const variationName = `Variation${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("slice", [
		"add-variation",
		variationName,
		"--to",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Added variation "${variationName}"`);
	expect(stdout).toContain(`to slice "${slice.id}"`);

	const updated = await readLocalSlice(project, slice.id);
	const variation = updated?.variations.find((v) => v.name === variationName);
	expect(variation).toBeDefined();
});

it("adds a variation with a screenshot URL", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const variationName = `Variation${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("slice", [
		"add-variation",
		variationName,
		"--to",
		slice.id,
		"--screenshot",
		"https://images.prismic.io/slice-machine/621a5ec4-0387-4bc5-9860-2dd46cbc07cd_default_ss.png",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Added variation "${variationName}"`);

	const updated = await readLocalSlice(project, slice.id);
	const variation = updated?.variations.find((v) => v.name === variationName);
	expect(variation).toBeDefined();
	expect(variation?.imageUrl).toContain("https://");
	expect(variation?.imageUrl).toContain(".png");
});

it("adds a variation with a local screenshot file", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const screenshotUrl =
		"https://images.prismic.io/slice-machine/621a5ec4-0387-4bc5-9860-2dd46cbc07cd_default_ss.png";
	const response = await fetch(screenshotUrl);
	const data = new Uint8Array(await response.arrayBuffer());
	const screenshotFileUrl = new URL("screenshot.png", project);
	await writeFile(screenshotFileUrl, data);
	const screenshotPath = fileURLToPath(screenshotFileUrl);

	const variationName = `Variation${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("slice", [
		"add-variation",
		variationName,
		"--to",
		slice.id,
		"--screenshot",
		screenshotPath,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Added variation "${variationName}"`);

	const updated = await readLocalSlice(project, slice.id);
	const variation = updated?.variations.find((v) => v.name === variationName);
	expect(variation).toBeDefined();
	expect(variation?.imageUrl).toContain("https://");
	expect(variation?.imageUrl).toContain(".png");
});
