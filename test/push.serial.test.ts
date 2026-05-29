import { fileURLToPath } from "node:url";

import { buildCustomType, buildSlice, it, writeLocalCustomType, writeLocalSlice } from "./it";
import {
	getCustomTypes,
	getScreenshotPrefix,
	getSlices,
	insertCustomType,
	listScreenshotFiles,
} from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("push", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic push [options]");
});

it("rejects an unknown --env", async ({ expect, prismic, repo }) => {
	const { stderr, exitCode } = await prismic("push", ["--repo", repo, "--env", "does-not-exist"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(`No environments available on repository "${repo}".`);
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

it("deletes a remote slice and its screenshots when removed locally", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	// Mirror remote into local so push only deletes the slice we remove below.
	const pull = await prismic("pull", ["--repo", repo, "--force"]);
	expect(pull.exitCode).toBe(0);

	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const insert = await prismic("push", ["--repo", repo]);
	expect(insert.exitCode).toBe(0);

	const screenshotPath = fileURLToPath(new URL("./fixtures/slice-screenshot.png", import.meta.url));

	const editVariation = await prismic("slice", [
		"edit-variation",
		"default",
		"--from-slice",
		slice.id,
		"--screenshot",
		screenshotPath,
	]);
	expect(editVariation.exitCode).toBe(0);

	const update = await prismic("push", ["--repo", repo]);
	expect(update.exitCode).toBe(0);

	const screenshotPrefix = getScreenshotPrefix({ repo, token, host }, slice.id);
	await expect
		.poll(async () => {
			const keys = await listScreenshotFiles({ repo, token, host });
			return keys.some((key) => key.startsWith(screenshotPrefix));
		})
		.toBe(true);

	const remove = await prismic("slice", ["remove", slice.id]);
	expect(remove.exitCode).toBe(0);

	const pushDelete = await prismic("push", ["--repo", repo, "--force"]);
	expect(pushDelete.exitCode).toBe(0);

	await expect
		.poll(async () => (await getSlices({ repo, token, host })).map((s) => s.id), {
			timeout: 5_000,
		})
		.not.toContain(slice.id);

	await expect
		.poll(async () => {
			const keys = await listScreenshotFiles({ repo, token, host });
			return keys.some((key) => key.startsWith(screenshotPrefix));
		})
		.toBe(false);
});
