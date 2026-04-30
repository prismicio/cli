import { readFile, stat } from "node:fs/promises";

import { buildCustomType, it, writeLocalCustomType } from "./it";
import { insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("fetch", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic fetch [options]");
});

it("refreshes the snapshot without modifying local files", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	// Seed remote with a custom type, and write a divergent local file. Fetch
	// should leave the local file untouched.
	const customType = buildCustomType({ label: "Remote" });
	await insertCustomType(customType, { repo, token, host });

	const localCustomType = buildCustomType({ label: "Local" });
	await writeLocalCustomType(project, localCustomType);

	const localPath = new URL(`customtypes/${localCustomType.id}/index.json`, project);
	const beforeMtime = (await stat(localPath)).mtimeMs;
	const beforeContent = await readFile(localPath, "utf8");

	const { exitCode } = await prismic("fetch", ["--repo", repo]);
	expect(exitCode).toBe(0);

	const afterMtime = (await stat(localPath)).mtimeMs;
	const afterContent = await readFile(localPath, "utf8");
	expect(afterMtime).toBe(beforeMtime);
	expect(afterContent).toBe(beforeContent);
});
