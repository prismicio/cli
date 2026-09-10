import { mkdir, writeFile } from "node:fs/promises";

import packageJson from "../package.json" with { type: "json" };
import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic <command> [options]");
	expect(stdout).toContain("MODELING");
	expect(stdout).toContain("ROUTES");
	expect(stdout).toContain("PREVIEWS");
	expect(stdout).not.toContain("starter");
});

it("prints help text by default", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("");
	expect(exitCode, stderr).toBe(0);
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

it("accepts --analytics-intent and --analytics-task-id on every command", async ({
	expect,
	prismic,
}) => {
	const args = ["--analytics-intent", "Add a blog", "--analytics-task-id", crypto.randomUUID()];
	const leaf = await prismic("docs", ["list", ...args]);
	expect(leaf.exitCode, leaf.stderr).toBe(0);
	const router = await prismic("repo", args);
	expect(router.exitCode, router.stderr).toBe(0);
	expect(router.stdout).toContain("prismic repo <command> [options]");
});

it("shows --analytics-intent and --analytics-task-id in help only when an agent is detected", async ({
	expect,
	prismic,
}) => {
	const agent = { nodeOptions: { env: { AI_AGENT: "test-agent" } } };
	const human = { nodeOptions: { env: { AI_AGENT: "", CLAUDECODE: "" } } };

	for (const [root, ...rest] of [[""], ["repo"], ["repo", "view"]]) {
		const args = [...rest, "--help"];
		expect((await prismic(root, args, agent)).stdout).toContain("--analytics-task-id");
		expect((await prismic(root, args, human)).stdout).not.toContain("--analytics-task-id");
	}
	expect((await prismic("", ["--help"], agent)).stdout).toContain("AGENTS");
	expect((await prismic("", ["--help"], human)).stdout).not.toContain("AGENTS");
});
