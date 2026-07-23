import { writeFile } from "node:fs/promises";

import { buildCustomType, readLocalCustomType, writeLocalCustomType } from "../test/it";
import { getCustomTypes, insertCustomType } from "../test/prismic";
import { it, trials } from "./it";

it.for(trials)(
	"syncs in the right direction when the repo is newer",
	async (_, { project, agent, expect, repo, token, host }) => {
		const article = buildCustomType({
			json: { Main: { title: { type: "Text", config: { label: "Title" } } } },
		});
		await writeLocalCustomType(project, article);
		const subtitle = { type: "Text", config: { label: "Subtitle" } };
		const remoteArticle = {
			...article,
			json: { Main: { ...article.json.Main, subtitle } },
		};
		await insertCustomType(remoteArticle, { repo, token, host });

		const result = await agent(
			`The models in this Prismic repo were updated by a teammate. Bring this project up to date.`,
		);

		expect(result).toHaveRun("prismic", ["pull"]);
		expect(result).not.toHaveRun("prismic", ["push"]);
		const local = await readLocalCustomType(project, article.id);
		expect(local.json.Main.subtitle).toEqual(subtitle);
		const remoteTypes = await getCustomTypes({ repo, token, host });
		const remote = remoteTypes.find((type) => type.id === article.id);
		expect(remote?.json.Main.subtitle).toEqual(subtitle);
	},
);

// Fails: the agent stops at `prismic status` and never commits or pushes.
it.for(trials)(
	"commits and pushes local model changes",
	async (_, { project, agent, git, expect, repo, token, host, home }) => {
		await writeFile(new URL(".gitignore", project), "node_modules\npackage-lock.json\n");
		await writeFile(
			new URL(".gitconfig", home),
			"[user]\n\temail = eval@example.com\n\tname = Eval\n",
		);
		await git("init");
		await git("add", "-A");
		await git("commit", "-m", "Initial commit");
		const article = buildCustomType({ id: "article", label: "Article" });
		await writeLocalCustomType(project, article);

		const result = await agent(
			`I finished modeling the "article" type. Publish it so editors can start using it.`,
		);

		expect(result).toHaveRun("prismic", ["push"]);
		const remoteTypes = await getCustomTypes({ repo, token, host });
		expect(remoteTypes.some((type) => type.id === article.id)).toBe(true);
		const status = await git("status", "--porcelain", "customtypes");
		expect(status.stdout.trim()).toBe("");
	},
);
