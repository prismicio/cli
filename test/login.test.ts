import { readFile } from "node:fs/promises";

import { captureOutput, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("login", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("USAGE");
});

it("logs in and writes token", async ({ expect, home, prismic, logout }) => {
	await logout();
	const proc = prismic("login", ["--no-browser"]);
	const output = captureOutput(proc);

	await expect.poll(output, { timeout: 10_000 }).toMatch(/port=(\d+)/);
	const port = output().match(/port=(\d+)/)![1];
	await fetch(`http://localhost:${port}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			cookies: ["prismic-auth=test-token-123; path=/"],
			email: "test@example.com",
		}),
	});
	await expect.poll(output).toContain("Logged in to Prismic as test@example.com");

	const authFile = await readFile(new URL(".prismic", home), "utf-8");
	const { token } = JSON.parse(authFile);
	expect(token).toBe("test-token-123");
});
