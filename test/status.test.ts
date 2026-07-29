import { describe } from "vitest";

import { buildCustomType, buildSlice, it, readLocalCustomType, writeLocalCustomType } from "./it";
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

	it("reports in-sync when local only reorders keys at any depth", async ({
		expect,
		project,
		prismic,
		repo,
		token,
		host,
	}) => {
		const customType = buildCustomType({
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
		await insertCustomType(customType, { repo, token, host });

		// Pull writes the canonical form to disk.
		const pull = await prismic("pull", ["--repo", repo]);
		expect(pull.exitCode, pull.stderr).toBe(0);

		// Hand-edit the local file: reverse key order at every depth, leaving all
		// values and the field order unchanged.
		const pulled = await readLocalCustomType(project, customType.id);
		const scrambled = scramble(pulled);
		// Confirm the hand-edit really produced a non-canonical file.
		expect(JSON.stringify(scrambled, null, 2)).not.toBe(JSON.stringify(pulled, null, 2));
		await writeLocalCustomType(project, scrambled);

		// Both sides canonicalize equal, so status must report no changes.
		const { stdout, stderr, exitCode } = await prismic("status", ["--repo", repo]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("Already up to date.");
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

// Reverses object key order at every depth, except field maps (`json` tabs
// and group `fields`), whose entry order is position-significant.
function scramble<T>(value: T, keepOrder = 0): T {
	if (Array.isArray(value)) return value.map((child) => scramble(child)) as T;
	if (value === null || typeof value !== "object") return value;
	const entries = Object.entries(value).map(([key, child]) => [
		key,
		scramble(child, key === "json" ? 2 : key === "fields" ? 1 : keepOrder - 1),
	]);
	return Object.fromEntries(keepOrder > 0 ? entries : entries.reverse());
}
