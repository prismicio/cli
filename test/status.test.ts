import { describe } from "vitest";

import {
	buildCustomType,
	buildSlice,
	it,
	readLocalCustomType,
	readLocalSlice,
	writeLocalCustomType,
	writeLocalSlice,
} from "./it";
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
		// Written with unsorted keys at every depth, so the fixtures double as the
		// non-canonical local files below.
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
								url: { type: "Text", config: { label: "URL", placeholder: "" } },
								label: { type: "Text", config: { label: "Label", placeholder: "" } },
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
		await Promise.all([
			insertCustomType(customType, { repo, token, host }),
			insertSlice(slice, { repo, token, host }),
		]);

		// Pull writes the canonical form to disk.
		const pull = await prismic("pull", ["--repo", repo]);
		expect(pull.exitCode, pull.stderr).toBe(0);

		// Write the fixtures back over the pulled files. Same models, different
		// key order.
		const pulledType = await readLocalCustomType(project, customType.id);
		expect(JSON.stringify(customType, null, 2)).not.toBe(JSON.stringify(pulledType, null, 2));
		await writeLocalCustomType(project, customType);

		const pulledSlice = await readLocalSlice(project, slice.id);
		if (!pulledSlice) throw new Error(`Slice "${slice.id}" was not pulled.`);
		expect(JSON.stringify(slice, null, 2)).not.toBe(JSON.stringify(pulledSlice, null, 2));
		await writeLocalSlice(project, slice);

		// Both sides canonicalize equal, so status must report no changes.
		const { stdout, stderr, exitCode } = await prismic("status", ["--repo", repo]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("Already up to date.");

		// Push uses the same comparison, so it must not update the remote models.
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
});
