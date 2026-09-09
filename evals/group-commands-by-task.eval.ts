import dedent from "dedent";
import { readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCustomType, writeLocalCustomType } from "../test/it";
import { it, trials } from "./it";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

it.for(trials)(
	"passes one task ID and intent to every command",
	async (_, { project, agent, expect }) => {
		const article = buildCustomType({ id: "article", label: "Article" });
		await writeLocalCustomType(project, article);
		const readArgv = await recordArgv(project);

		const request = `Add a "title" rich text field and a "published_at" date field to the "article" type.`;
		await agent(request);

		const calls = (await readArgv()).filter(
			(argv) => !argv.includes("--help") && !argv.includes("-h"),
		);
		const seen = calls.map((argv) => argv.join(" ")).join("\n");
		expect(calls.length, seen).toBeGreaterThan(0);

		const taskIds = new Set(calls.map((argv) => optionValue(argv, "task-id")));
		expect([...taskIds], seen).toHaveLength(1);
		expect([...taskIds][0], seen).toMatch(UUID);

		const intents = new Set(calls.map((argv) => optionValue(argv, "intent")));
		expect([...intents], seen).toHaveLength(1);
		await expect([...intents][0]).toSatisfyJudge(dedent`
			The user asked an agent: ${request}
			Above is the value the agent passed as --intent to the Prismic CLI.
			Passes if it paraphrases the user's request in one short sentence.
			Fails if it is empty, describes a single CLI command rather than the whole request, or is not a sentence.
		`);
	},
);

function optionValue(argv: string[], name: string): string | undefined {
	const index = argv.indexOf(`--${name}`);
	if (index !== -1) return argv[index + 1];
	return argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/** Wraps the project's `prismic` bin to log the argv of every call, as the CLI receives it. */
async function recordArgv(project: URL): Promise<() => Promise<string[][]>> {
	const log = join(tmpdir(), `prismic-argv-${crypto.randomUUID()}.jsonl`);
	const bin = new URL("node_modules/.bin/prismic", project);
	const cli = await readlink(bin);
	await rm(bin);
	await writeFile(
		bin,
		dedent`
			#!/bin/sh
			node -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- "$@" >> ${JSON.stringify(log)}
			exec node ${JSON.stringify(cli)} "$@"
		`,
		{ mode: 0o755 },
	);
	return async () => {
		const lines = await readFile(log, "utf8").catch(() => "");
		return lines
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
	};
}
