import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSlice, it } from "./it";
import { getSlices, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["add-variation", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice add-variation <name> [options]");
});

it("adds a variation to a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

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

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const variation = updated?.variations.find((v) => v.name === variationName);
	expect(variation).toBeDefined();
});

it("adds a variation with a screenshot URL", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const variationName = `Variation${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("slice", [
		"add-variation",
		variationName,
		"--to",
		slice.id,
		"--screenshot",
		"https://images.prismic.io/slice-machine/621a5ec4-0387-4bc5-9860-2dd46cbc07cd_default_ss.png?auto=compress,format",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Added variation "${variationName}"`);

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const variation = updated?.variations.find((v) => v.name === variationName);
	expect(variation).toBeDefined();
	expect(variation?.imageUrl).toContain("https://");
	expect(variation?.imageUrl).toContain(".png");
});

it("adds a variation with a local screenshot file", async ({ expect, prismic, project, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const screenshotUrl = "https://images.prismic.io/slice-machine/621a5ec4-0387-4bc5-9860-2dd46cbc07cd_default_ss.png?auto=compress,format";
	const response = await fetch(screenshotUrl);
	const data = new Uint8Array(await response.arrayBuffer());
	const screenshotPath = join(fileURLToPath(project), "screenshot.png");
	await writeFile(screenshotPath, data);

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

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const variation = updated?.variations.find((v) => v.name === variationName);
	expect(variation).toBeDefined();
	expect(variation?.imageUrl).toContain("https://");
	expect(variation?.imageUrl).toContain(".png");
});
