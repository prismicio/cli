import { beforeEach, expect, it, vi } from "vitest";

import { type Environment, getEnvironments } from "./clients/core";
import { getProfile } from "./clients/user";
import { getUserEnvironments } from "./environments";

vi.mock("./clients/core", () => ({
	getEnvironments: vi.fn(),
}));

vi.mock("./clients/user", () => ({
	getProfile: vi.fn(),
}));

function jwt(payload: unknown): string {
	const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
	return `eyJhbGciOiJub25lIn0.${encoded}.sig`;
}

const environments: Environment[] = [
	{ kind: "prod", name: "Example", domain: "example", users: [{ id: "ada" }] },
	{ kind: "stage", name: "Staging", domain: "example-staging", users: [{ id: "ada" }] },
	{ kind: "dev", name: "Dev", domain: "example-dev", users: [{ id: "ada" }] },
];

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getEnvironments).mockResolvedValue(environments);
});

it("resolves --env from the Write API token domain without calling profile", async () => {
	const token = jwt({ domain: "example-staging", appName: "CLI" });

	const resolved = await getUserEnvironments({ repo: "example", token, host: "prismic.io" });

	expect(resolved).toEqual([environments[1]]);
	expect(getProfile).not.toHaveBeenCalled();
	expect(getEnvironments).toHaveBeenCalledWith({ repo: "example", token, host: "prismic.io" });
});

it("resolves a dev environment when that is the token domain", async () => {
	const token = jwt({ domain: "example-dev", appName: "CLI" });

	const resolved = await getUserEnvironments({ repo: "example", token, host: "prismic.io" });

	expect(resolved).toEqual([environments[2]]);
	expect(getProfile).not.toHaveBeenCalled();
});

it("returns no environment when the token domain is not in the list", async () => {
	const token = jwt({ domain: "missing", appName: "CLI" });

	const resolved = await getUserEnvironments({ repo: "example", token, host: "prismic.io" });

	expect(resolved).toEqual([]);
	expect(getProfile).not.toHaveBeenCalled();
});

it("keeps prod and stage environments the user belongs to", async () => {
	vi.mocked(getProfile).mockResolvedValue({
		email: "ada@example.com",
		shortId: "ada",
		intercomHash: "hash",
	});

	const token = jwt({ email: "ada@example.com" });
	const resolved = await getUserEnvironments({ repo: "example", token, host: "prismic.io" });

	expect(resolved.map((environment) => environment.domain)).toEqual(["example", "example-staging"]);
	expect(getProfile).toHaveBeenCalledWith({ token, host: "prismic.io" });
});
