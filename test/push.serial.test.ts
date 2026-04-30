import { buildCustomType, it, writeLocalCustomType } from "./it";
import { getCustomTypes, insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("push", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic push [options]");
});

it("pushes a new local custom type to remote", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	// Mirror remote into local so push only sees the addition (avoids spurious
	// destructive ops against models inserted by other tests).
	const pull = await prismic("pull", ["--repo", repo]);
	expect(pull.exitCode).toBe(0);

	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { exitCode } = await prismic("push", ["--repo", repo]);
	expect(exitCode).toBe(0);

	const remote = await getCustomTypes({ repo, token, host });
	expect(remote.map((t) => t.id)).toContain(customType.id);
});

it("pushes a local edit that overwrites a remote model", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType({ label: "Original" });
	await insertCustomType(customType, { repo, token, host });

	const pull = await prismic("pull", ["--repo", repo]);
	expect(pull.exitCode).toBe(0);

	await writeLocalCustomType(project, { ...customType, label: "Modified" });

	const { exitCode } = await prismic("push", ["--repo", repo]);
	expect(exitCode).toBe(0);

	const remote = await getCustomTypes({ repo, token, host });
	const updated = remote.find((t) => t.id === customType.id);
	expect(updated?.label).toBe("Modified");
});
