import { vi } from "vitest";

import { it } from "./it";
import { addPreview, createWriteToken, deleteWriteToken } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("preview", ["list", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic preview list [options]");
});

it("lists previews", async ({ expect, prismic, repo, token, host }) => {
	const previewUrl = `https://test-${crypto.randomUUID()}.example.com/api/preview`;

	await addPreview(previewUrl, "Test Preview", { repo, token, host });

	const { stdout, stderr, exitCode } = await prismic("preview", ["list"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(previewUrl);
});

it("lists previews as JSON", async ({ expect, prismic, repo, token, host }) => {
	const previewUrl = `https://test-${crypto.randomUUID()}.example.com/api/preview`;

	await addPreview(previewUrl, "Test Preview", { repo, token, host });

	const { stdout, stderr, exitCode } = await prismic("preview", ["list", "--json"]);
	expect(exitCode, stderr).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed.previews).toEqual(
		expect.arrayContaining([expect.objectContaining({ url: previewUrl })]),
	);
	expect(parsed).toHaveProperty("simulatorUrl");
});

it("distinguishes a Write API token from an invalid token", async ({ expect }) => {
	const previousProd = process.env.PROD;
	const previousToken = process.env.PRISMIC_TOKEN;
	process.env.PROD = "false";
	process.env.PRISMIC_TOKEN = "write-api-token";
	vi.resetModules();
	try {
		const { getErrorMessage } = await import("../src/error");
		const { ForbiddenRequestError, UnauthorizedRequestError } = await import("../src/lib/request");

		const response = new Response(null, { status: 401, statusText: "Unauthorized" });
		const invalidContext = new UnauthorizedRequestError(response, {
			error: "invalid_auth_context",
		});
		const emptyBody = new UnauthorizedRequestError(response, undefined);
		const userForbidden = new ForbiddenRequestError(response, {
			message: "You're not authorized as a user",
		});

		expect(await getErrorMessage(invalidContext)).toBe(
			"This Write API token cannot run administrative commands. Unset PRISMIC_TOKEN and run prismic login.",
		);
		expect(await getErrorMessage(emptyBody)).toBe(
			"PRISMIC_TOKEN is invalid or expired, or doesn't have access to this repository. Unset it to log in with a browser, or replace it with a valid token.",
		);
		expect(await getErrorMessage(userForbidden)).toBe(
			"PRISMIC_TOKEN is invalid or expired, or doesn't have access to this repository. Unset it to log in with a browser, or replace it with a valid token.",
		);
	} finally {
		if (previousProd === undefined) delete process.env.PROD;
		else process.env.PROD = previousProd;
		if (previousToken === undefined) delete process.env.PRISMIC_TOKEN;
		else process.env.PRISMIC_TOKEN = previousToken;
		vi.resetModules();
	}
});

it("tells a Write API token it cannot list previews", async ({
	expect,
	prismic,
	repo,
	token,
	host,
}) => {
	const writeToken = await createWriteToken({ repo, token, host });
	try {
		const first = await prismic("preview", ["list"], {
			nodeOptions: { env: { PRISMIC_TOKEN: writeToken.token } },
		});
		const second = await prismic("preview", ["list"], {
			nodeOptions: { env: { PRISMIC_TOKEN: writeToken.token } },
		});

		for (const { stderr, exitCode } of [first, second]) {
			expect(exitCode, stderr).not.toBe(0);
			expect(stderr).toContain(
				"This Write API token cannot run administrative commands. Unset PRISMIC_TOKEN and run prismic login.",
			);
			expect(stderr).not.toContain("PRISMIC_TOKEN is invalid or expired");
		}
	} finally {
		await deleteWriteToken(writeToken.token, { repo, token, host });
	}
});
