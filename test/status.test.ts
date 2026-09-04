import { fileURLToPath } from "node:url";
import { x } from "tinyexec";
import { describe } from "vitest";

import { buildCustomType, buildSlice, it, writeLocalCustomType, writeLocalSlice } from "./it";
import { insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("status", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic status [options]");
});

describe("with an isolated repository", () => {
	it.scoped({ isolateRepo: true });

	it("reports in-sync when local matches remote", async ({ expect, prismic, repo }) => {
		const pull = await prismic("pull", ["--repo", repo]);
		expect(pull.exitCode, pull.stderr).toBe(0);

		const { stdout, stderr, exitCode } = await prismic("status", ["--repo", repo]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain(`Repository: ${repo}`);
		expect(stdout).toContain("Already up to date.");
	});

	it("reports local-only models when added locally but not pushed", async ({
		expect,
		project,
		prismic,
		repo,
	}) => {
		const pull = await prismic("pull", ["--repo", repo]);
		expect(pull.exitCode, pull.stderr).toBe(0);

		const customType = buildCustomType();
		await writeLocalCustomType(project, customType);

		const { stdout, stderr, exitCode } = await prismic("status", ["--repo", repo]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("Local-only:");
		expect(stdout).toContain(`${customType.id} (custom type)`);
		expect(stdout).toContain("Next:");
		expect(stdout).toContain("prismic push");
	});

	it("reports remote-only models when added remotely but not pulled", async ({
		expect,
		prismic,
		repo,
		token,
		host,
	}) => {
		const pull = await prismic("pull", ["--repo", repo]);
		expect(pull.exitCode, pull.stderr).toBe(0);

		const slice = buildSlice();
		await insertSlice(slice, { repo, token, host });

		const { stdout, stderr, exitCode } = await prismic("status", ["--repo", repo]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("Remote-only:");
		expect(stdout).toContain(`${slice.id} (slice)`);
		expect(stdout).toContain("prismic pull");
	});

	it("reports in-sync and push writes nothing when local only reorders keys", async ({
		expect,
		project,
		prismic,
		repo,
		token,
		host,
	}) => {
		const customType = buildCustomType({
			format: "custom",
			json: {
				Main: {
					title: { type: "Text", config: { label: "Title", placeholder: "Enter a title" } },
					social_image: {
						type: "Image",
						config: {
							label: "Social image",
							constraint: { width: 1200, height: 630 },
							thumbnails: [{ name: "small", width: 100, height: 50 }],
						},
					},
					links: {
						type: "Group",
						config: {
							label: "Links",
							fields: {
								url: { type: "Text", config: { placeholder: "", label: "URL" } },
								label: { type: "Text", config: { placeholder: "", label: "Label" } },
							},
						},
					},
				},
			},
		} as Partial<ReturnType<typeof buildCustomType>>);
		const slice = buildSlice();
		slice.variations[0].primary = {
			title: { type: "Text", config: { placeholder: "Enter a title", label: "Title" } },
		};
		expect(Object.keys(customType)).not.toEqual(Object.keys(customType).sort());

		await writeLocalCustomType(project, customType);
		await writeLocalSlice(project, slice);
		await Promise.all([
			insertCustomType(customType, { repo, token, host }),
			insertSlice(slice, { repo, token, host }),
		]);

		const { stdout, stderr, exitCode } = await prismic("status", ["--repo", repo]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("Already up to date.");

		const push = await prismic("push", ["--repo", repo]);
		expect(push.exitCode, push.stderr).toBe(0);
		expect(push.stdout).toContain("Already up to date.");
	});

	it("reports differing models when local and remote disagree", async ({
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
		expect(pull.exitCode, pull.stderr).toBe(0);

		await writeLocalCustomType(project, { ...customType, label: "Modified" });

		const { stdout, stderr, exitCode } = await prismic("status", ["--repo", repo]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("Differ:");
		expect(stdout).toContain(`${customType.id} (custom type)`);
	});

	it("lists the commit as the first step when model files are uncommitted", async ({
		expect,
		project,
		prismic,
		repo,
	}) => {
		const pull = await prismic("pull", ["--repo", repo]);
		expect(pull.exitCode, pull.stderr).toBe(0);

		const cwd = fileURLToPath(project);
		await x("git", ["init", "-q", "-b", "main"], { nodeOptions: { cwd } });
		await writeLocalCustomType(project, buildCustomType({ id: "article", label: "Article" }));

		const { stdout, stderr, exitCode } = await prismic("status", ["--repo", repo]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain(
			"Prismic keeps model history in git. Commit model changes before you push or pull them.",
		);
		// The commit is step 1 of the push, not a blocker with a --force workaround.
		expect(stdout).toContain("Next:");
		expect(stdout.indexOf("git commit")).toBeLessThan(stdout.indexOf("prismic push"));
		expect(stdout).toContain("prismic push  # creates 1, updates 0, deletes 0");
		expect(stdout).not.toContain("--force");
	});
});
