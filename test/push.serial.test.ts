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
	const sync = await prismic("sync", ["--repo", repo, "--force"]);
	expect(sync.exitCode).toBe(0);

	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { exitCode } = await prismic("push", ["--repo", repo, "--force"]);
	expect(exitCode).toBe(0);

	const remote = await getCustomTypes({ repo, token, host });
	expect(remote.map((t) => t.id)).toContain(customType.id);
});

it("refuses without --force when destructive changes are detected", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType({ label: "Original" });
	await insertCustomType(customType, { repo, token, host });

	// Sync to mirror remote and write a snapshot.
	const sync = await prismic("sync", ["--repo", repo, "--force"]);
	expect(sync.exitCode).toBe(0);

	// Modify the local model so push wants to overwrite the remote one.
	await writeLocalCustomType(project, { ...customType, label: "Modified" });

	const { exitCode, stderr } = await prismic("push", ["--repo", repo]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("--force");
});

it("refuses on remote drift without --force", async ({
	expect,
	prismic,
	repo,
	token,
	host,
}) => {
	// Sync to write a snapshot of current remote state.
	const sync = await prismic("sync", ["--repo", repo, "--force"]);
	expect(sync.exitCode).toBe(0);

	// Mutate the remote out-of-band so it diverges from the snapshot.
	const drifted = buildCustomType();
	await insertCustomType(drifted, { repo, token, host });

	const { exitCode, stderr } = await prismic("push", ["--repo", repo]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Remote has changed");
});
