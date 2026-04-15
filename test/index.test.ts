import { mkdir, writeFile } from "node:fs/promises";

import packageJson from "../package.json" with { type: "json" };
import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic <command> [options]");
});

it("prints help text by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic <command> [options]");
});

it("prints an update notification when a newer version is cached", async ({
	expect,
	home,
	prismic,
}) => {
	const configDir = new URL(".config/prismic/", home);
	await mkdir(configDir, { recursive: true });
	await writeFile(
		new URL("update-notifier.json", configDir),
		JSON.stringify({
			latestKnownVersion: "99.0.0",
			lastUpdateCheckAt: Date.now(),
		}),
	);

	const { stdout, stderr } = await prismic("", ["--version"], {
		nodeOptions: { env: { NO_UPDATE_NOTIFIER: "0" } },
	});

	expect(stdout).toContain(packageJson.version);
	expect(stderr).toContain("Update available");
	expect(stderr).toContain("99.0.0");
});
