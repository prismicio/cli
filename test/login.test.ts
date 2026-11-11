import { readFile } from "node:fs/promises";
import { createServer } from "node:net";

import { captureOutput, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("login", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic login [options]");
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

	const authFile = await readFile(new URL(".config/prismic/credentials.json", home), "utf-8");
	const { token } = JSON.parse(authFile);
	expect(token).toBe("test-token-123");
});

it("prints the login URL once when the preferred port is in use", async ({
	expect,
	prismic,
	logout,
	onTestFinished,
}) => {
	await logout();
	// Another test may already hold the port, which also triggers the fallback.
	const blocker = createServer();
	await new Promise<void>((resolve) =>
		blocker.once("error", resolve).listen(5555, "0.0.0.0", resolve),
	);
	onTestFinished(() => void blocker.close());

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

	expect(output().match(/port=\d+/g)).toHaveLength(1);
});
