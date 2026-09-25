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

it("accepts --user-intent and --task-id on every command", async ({ expect, prismic }) => {
	const { stdout: id } = await prismic("task-id");
	const args = ["--user-intent", "Add a blog", "--task-id", id.trim()];
	const leaf = await prismic("docs", ["list", ...args]);
	expect(leaf.exitCode, leaf.stderr).toBe(0);
	const router = await prismic("repo", args);
	expect(router.exitCode, router.stderr).toBe(0);
	expect(router.stdout).toContain("prismic repo <command> [options]");
});

it("still accepts --analytics-intent and --analytics-task-id", async ({ expect, prismic }) => {
	const agent = { nodeOptions: { env: { AI_AGENT: "test-agent" } } };
	const { stdout: id } = await prismic("task-id", [], agent);
	const legacy = await prismic(
		"docs",
		["list", "--analytics-intent", "Add a blog", "--analytics-task-id", id.trim()],
		agent,
	);
	expect(legacy.exitCode, legacy.stderr).toBe(0);
});

it("requires --user-intent and a generated --task-id when an agent is detected", async ({
	expect,
	prismic,
}) => {
	const agent = { nodeOptions: { env: { AI_AGENT: "test-agent" } } };
	const taskId = (await prismic("task-id", [], agent)).stdout.trim();

	const missingTaskId = await prismic("docs", ["list", "--user-intent", "Add a blog"], agent);
	expect(missingTaskId.exitCode).toBe(1);
	expect(missingTaskId.stderr).toContain("missing --task-id");

	const madeUpTaskId = await prismic(
		"docs",
		["list", "--user-intent", "Add a blog", "--task-id", crypto.randomUUID()],
		agent,
	);
	expect(madeUpTaskId.exitCode).toBe(1);
	expect(madeUpTaskId.stderr).toContain("--task-id must come from `prismic task-id`");

	const missingIntent = await prismic("docs", ["list", "--task-id", taskId], agent);
	expect(missingIntent.exitCode).toBe(1);
	expect(missingIntent.stderr).toContain("missing --user-intent");

	const ok = await prismic(
		"docs",
		["list", "--user-intent", "Add a blog", "--task-id", taskId],
		agent,
	);
	expect(ok.exitCode, ok.stderr).toBe(0);

	const help = await prismic("docs", ["list", "--help"], agent);
	expect(help.exitCode, help.stderr).toBe(0);
});

it("shows the agent options and `task-id` in help only when an agent is detected", async ({
	expect,
	prismic,
}) => {
	const agent = { nodeOptions: { env: { AI_AGENT: "test-agent" } } };
	const human = { nodeOptions: { env: { AI_AGENT: "" } } };

	for (const [root, ...rest] of [[""], ["repo"], ["repo", "view"]]) {
		const args = [...rest, "--help"];
		expect((await prismic(root, args, agent)).stdout).toContain("--task-id");
		expect((await prismic(root, args, human)).stdout).not.toContain("--task-id");
	}

	const agentHelp = (await prismic("", ["--help"], agent)).stdout;
	const humanHelp = (await prismic("", ["--help"], human)).stdout;
	expect(agentHelp).toContain("AGENTS");
	expect(humanHelp).not.toContain("AGENTS");
	expect(agentHelp).not.toContain("--analytics-task-id");
});
