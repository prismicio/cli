import { readdir, readFile } from "node:fs/promises";

import {
	buildCustomType,
	captureOutput,
	readLocalCustomType,
	writeLocalCustomType,
} from "../test/it";
import { getCustomTypes } from "../test/prismic";
import { it, trials } from "./it";

it.for(trials)(
	"edits local models while the Type Builder is open",
	async (_, { project, agent, exec, prismic, expect, repo, token, host }) => {
		const article = buildCustomType({
			json: { Main: { title: { type: "Text", config: { label: "Title" } } } },
		});
		await writeLocalCustomType(project, article);
		await exec("git", ["add", "-A"]);
		await exec("git", ["commit", "-q", "-m", "Add article"]);

		const output = captureOutput(prismic("dev", ["--no-browser"]));
		await expect.poll(output, { timeout: 30_000 }).toContain("Type Builder:");
		const releaseId = output().match(/\?r=(\S+)/)?.[1];

		const result = await agent(
			`I'm editing models in the Type Builder with \`prismic dev\` running. Add a Subtitle text field to the ${article.label} type.`,
		);

		expect(result).not.toHaveRun(["push"]);
		expect(result).not.toHaveRun(["pull"]);
		expect(result).not.toHaveRun(["sync"]);
		const local = await readLocalCustomType(project, article.id);
		expect(Object.keys(local.json.Main)).toContain("subtitle");
		await expect
			.poll(
				async () => {
					const types = await getCustomTypes({ repo, token, host, releaseId });
					return Object.keys(types.find((type) => type.id === article.id)?.json.Main ?? {});
				},
				{ timeout: 30_000 },
			)
			.toContain("subtitle");
	},
);

it.for(trials)(
	"starts the Type Builder when asked",
	async (_, { agent, home, expect, onTestFinished }) => {
		onTestFinished(() => stopBackgroundSessions(home));

		const result = await agent(
			"Open the Type Builder so I can edit this project's models visually.",
		);

		expect(result).toHaveRun(["dev"]);
		expect(result.text).toContain("/builder/types?r=");
	},
);

async function stopBackgroundSessions(home: URL): Promise<void> {
	const dir = new URL(".config/prismic/dev/", home);
	for (const file of await readdir(dir).catch(() => [])) {
		const { pid } = JSON.parse(await readFile(new URL(file, dir), "utf8"));
		try {
			process.kill(pid, "SIGINT");
		} catch {}
	}
}
