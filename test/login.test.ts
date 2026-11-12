import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { createFakeAuth0 } from "./auth0";
import { approveLogin, captureOutput, captureStdout, getUserCode, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("login", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic login [options]");
});

it("logs in with a code, and saves the login for this user only", async ({
	expect,
	home,
	prismic,
	login,
	logout,
	auth0,
	token,
}) => {
	const { email } = await login();
	await logout();

	const proc = prismic("login", ["--no-browser"]);
	const output = captureOutput(proc);
	await approveLogin(expect, output, auth0);
	const { exitCode } = await proc;
	expect(exitCode, output()).toBe(0);
	expect(output()).toMatch(
		/Open this URL on any device to log in:\n {2}http:\/\/127\.0\.0\.1:\d+\/activate\?user_code=/,
	);
	expect(output()).toContain(`Check that the page shows the code ${getUserCode(output())}.`);
	expect(output()).toContain(`Logged in to Prismic as ${email}`);
	const deviceCode = auth0.requests.find((request) => request.params.device_code)?.params
		.device_code;
	expect(deviceCode).toBeDefined();
	expect(output()).not.toContain(deviceCode);
	expect(output()).not.toContain(token);

	const path = new URL(".config/prismic/credentials.json", home);
	const credentials = await readFile(path, "utf8");
	if (process.platform === "linux") {
		// CI has no Secret Service.
		expect(JSON.parse(credentials)).toMatchObject({
			store: "file",
			storeReason: "secret-service-missing",
		});
	} else {
		expect(JSON.parse(credentials)).toMatchObject({ store: "keyring" });
		expect(credentials).not.toContain(token);
	}
	if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);

	const whoami = await prismic("whoami");
	expect(whoami.exitCode, whoami.stderr).toBe(0);
	expect(whoami.stdout).toContain(email);
});

it("stops an agent after 90 seconds, and its next run continues the login", async ({
	expect,
	prismic,
	logout,
	auth0,
}) => {
	await logout();
	const { stdout: taskId } = await prismic("task-id");
	const args = ["--task-id", taskId.trim(), "--user-intent", "Log in to Prismic"];
	const agent = { nodeOptions: { env: { AI_AGENT: "test-agent" } } };

	const startedAt = Date.now();
	const first = await prismic("login", args, agent);
	expect(first.exitCode).toBe(1);
	expect(Date.now() - startedAt).toBeGreaterThanOrEqual(90_000);
	expect(first.stderr).toContain(
		"Waiting for approval. After the user approves, run the same command again. It continues this login.",
	);

	auth0.approve();
	const second = await prismic("login", args, agent);
	expect(second.exitCode, second.stderr).toBe(0);
	expect(getUserCode(second.stderr)).toBe(getUserCode(first.stderr));
	expect(auth0.requests.filter((request) => request.path === "/oauth/device/code")).toHaveLength(1);
}, 150_000);

it("continues a killed login with its code and its slower polling", async ({
	expect,
	prismic,
	logout,
	auth0,
}) => {
	await logout();
	const first = prismic("login");
	const output = captureOutput(first);
	await expect.poll(output, { timeout: 15_000 }).toContain("Waiting for the login");
	// Adds 5 seconds to the polling interval for the rest of this login.
	const answered = auth0.requests.length;
	auth0.respondOnce("/oauth/token", { status: 429, body: { error: "slow_down" } });
	await expect.poll(() => auth0.requests.length).toBeGreaterThan(answered);
	// The CLI saves the new interval right after the answer.
	await new Promise((resolve) => setTimeout(resolve, 1000));
	first.kill();
	await first;

	const resumedAt = Date.now();
	const second = prismic("login");
	const resumed = captureOutput(second);
	await expect.poll(resumed, { timeout: 15_000 }).toContain("Waiting for the login");
	expect(getUserCode(resumed())).toBe(getUserCode(output()));
	const polls = () => auth0.requests.filter((request) => request.at >= resumedAt);
	await expect.poll(() => polls().length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
	const [firstPoll, secondPoll] = polls();
	expect(secondPoll.at - firstPoll.at).toBeGreaterThanOrEqual(5_000);

	auth0.approve();
	const { exitCode } = await second;
	expect(exitCode, resumed()).toBe(0);
	expect(auth0.requests.filter((request) => request.path === "/oauth/device/code")).toHaveLength(1);
}, 60_000);

it.skipIf(process.platform === "win32")(
	"cancels on Ctrl-C, and the next run starts a new login",
	async ({ expect, prismic, logout }) => {
		await logout();
		const first = prismic("login");
		const output = captureOutput(first);
		await expect.poll(output, { timeout: 15_000 }).toContain("Waiting for the login");
		first.kill("SIGINT");
		const { exitCode } = await first;
		expect(exitCode).toBe(130);
		expect(output()).toContain("Login cancelled.");

		const second = prismic("login");
		const next = captureOutput(second);
		await expect.poll(next, { timeout: 15_000 }).toContain("Waiting for the login");
		expect(getUserCode(next())).not.toBe(getUserCode(output()));
	},
);

it("makes another command wait for the login in progress", async ({
	expect,
	prismic,
	logout,
	auth0,
	repo,
}) => {
	await logout();
	// Both start before either has a code.
	const login = prismic("login");
	const repos = prismic("repo", ["list", "--json"], { nodeOptions: { env: { CI: "" } } });
	const loginOutput = captureOutput(login);
	const reposOutput = captureOutput(repos);
	const reposStdout = captureStdout(repos);
	await expect.poll(loginOutput, { timeout: 15_000 }).toContain("Waiting for the login");
	await expect.poll(reposOutput, { timeout: 15_000 }).toContain("Waiting for the login");
	expect(getUserCode(reposOutput())).toBe(getUserCode(loginOutput()));

	auth0.approve();
	expect((await login).exitCode, loginOutput()).toBe(0);
	expect((await repos).exitCode, reposOutput()).toBe(0);
	expect(JSON.parse(reposStdout())).toEqual(
		expect.arrayContaining([expect.objectContaining({ domain: repo })]),
	);
	expect(auth0.requests.filter((request) => request.path === "/oauth/device/code")).toHaveLength(1);
});

it("starts its own login when the login it waited for fails", async ({
	expect,
	prismic,
	login,
	auth0,
}) => {
	// An expired token stays saved when a login fails.
	await login({ expiresAt: Date.now() - 1000 });
	const first = prismic("login");
	const firstOutput = captureOutput(first);
	await expect.poll(firstOutput, { timeout: 15_000 }).toContain("Waiting for the login");
	const second = prismic("login");
	const secondOutput = captureOutput(second);
	await expect.poll(secondOutput, { timeout: 15_000 }).toContain("Waiting for the login");

	auth0.deny();
	expect((await first).exitCode).toBe(1);
	expect(firstOutput()).toContain("The login was declined in the browser.");
	await expect
		.poll(() => secondOutput().split("Waiting for the login").length, { timeout: 15_000 })
		.toBe(3);
	expect(getUserCode(secondOutput().split("Waiting for the login")[1])).not.toBe(
		getUserCode(firstOutput()),
	);
	auth0.approve();
	expect((await second).exitCode, secondOutput()).toBe(0);
});

it("drops a login that a logout cancelled while it waited", async ({
	expect,
	prismic,
	logout,
	auth0,
}) => {
	await logout();
	const login = prismic("login");
	const output = captureOutput(login);
	await expect.poll(output, { timeout: 15_000 }).toContain("Waiting for the login");
	expect((await prismic("logout")).exitCode).toBe(0);

	auth0.approve();
	expect((await login).exitCode).toBe(1);
	expect(output()).toContain("A logout cancelled this login. Run the command again to log in.");
	// The tokens the approval gave are revoked, and nothing is saved.
	const issued = auth0.requests.filter((request) => request.path === "/oauth/revoke");
	expect(issued).toHaveLength(1);
	expect((await prismic("whoami")).stderr).toContain("Not logged in.");
});

it("starts a new login for another Auth0 client instead of resuming", async ({
	expect,
	prismic,
	logout,
	token,
	onTestFinished,
}) => {
	await logout();
	const first = prismic("login");
	const output = captureOutput(first);
	await expect.poll(output, { timeout: 15_000 }).toContain("Waiting for the login");
	first.kill();
	await first;

	const other = await createFakeAuth0({ accessToken: token, interval: 0.1 });
	onTestFinished(() => other.close());
	const env = { PRISMIC_AUTH0_DOMAIN: other.auth0Domain, PRISMIC_AUTH0_CLIENT_ID: other.clientId };
	const second = prismic("login", [], { nodeOptions: { env } });
	const next = captureOutput(second);
	await approveLogin(expect, next, other);
	expect((await second).exitCode, next()).toBe(0);
	expect(getUserCode(next())).not.toBe(getUserCode(output()));
});

it("explains a login that Auth0 refused, without reporting it", async ({
	expect,
	prismic,
	logout,
	auth0,
	onTestFinished,
}) => {
	await logout();
	const sentry = await createFakeSentry();
	onTestFinished(() => sentry.close());
	const answers = [
		[() => auth0.deny(), "The login was declined in the browser."],
		[
			() => auth0.deny({ description: "email_verification_failed" }),
			"Prismic sent you an email to verify your address. Verify it, then run the command again.",
		],
		[() => auth0.expire(), "The login code expired. Run the command again."],
		[
			() => auth0.respondOnce("/oauth/token", { status: 403, body: { error: "invalid_grant" } }),
			"The login code was already used or isn't valid. Run the command again.",
		],
	] as const;

	for (const [answer, message] of answers) {
		const proc = prismic("login", [], { nodeOptions: { env: sentry.env } });
		const output = captureOutput(proc);
		await expect.poll(output, { timeout: 15_000 }).toContain("Waiting for the login");
		answer();
		expect((await proc).exitCode).toBe(1);
		expect(output()).toContain(message);
	}
	// Each refused code was deleted, so each run started a new one.
	expect(auth0.requests.filter((request) => request.path === "/oauth/device/code")).toHaveLength(4);
	// Windows doesn't resolve `sentry.localhost`.
	if (process.platform !== "win32") expect(sentry.events).toHaveLength(0);
});

it("reports a login that isn't set up, with only Auth0's error code", async ({
	expect,
	host,
	prismic,
	logout,
	onTestFinished,
}) => {
	await logout();
	const sentry = await createFakeSentry();
	onTestFinished(() => sentry.close());
	const { stderr, exitCode } = await prismic("login", [], {
		nodeOptions: { env: { ...sentry.env, PRISMIC_AUTH0_CLIENT_ID: "unknown-client" } },
	});
	expect(exitCode).toBe(1);
	expect(stderr).toContain(
		`Login isn't set up correctly for ${host} (invalid_client). Report this: https://github.com/prismicio/cli/issues`,
	);
	// Windows doesn't resolve `sentry.localhost`.
	if (process.platform !== "win32") {
		expect(sentry.events).toHaveLength(1);
		expect(sentry.events[0]).toContain("invalid_client");
		// The fake's error description is only in the response body.
		expect(sentry.events[0]).not.toContain("Unknown client.");
	}
});

it("revokes the previous session after a new login", async ({ expect, prismic, login, auth0 }) => {
	const refreshToken = auth0.issueRefreshToken();
	await login({ refreshToken });

	const proc = prismic("login");
	await approveLogin(expect, captureOutput(proc), auth0);
	expect((await proc).exitCode).toBe(0);
	const revokes = auth0.requests.filter((request) => request.path === "/oauth/revoke");
	expect(revokes.map((request) => request.params.token)).toEqual([refreshToken]);
});

it("replaces a login saved by an older version, without revoking it", async ({
	expect,
	home,
	prismic,
	logout,
	auth0,
	token,
}) => {
	await logout();
	const configDir = new URL(".config/prismic/", home);
	await mkdir(configDir, { recursive: true });
	await writeFile(
		new URL("credentials.json", configDir),
		JSON.stringify({ token, host: "prismic.io" }),
	);
	// A downgrade and a login with the older version leave this behind.
	await writeFile(new URL("credentials.enc", configDir), "leftover");

	const proc = prismic("login");
	await approveLogin(expect, captureOutput(proc), auth0);
	expect((await proc).exitCode).toBe(0);
	expect(auth0.requests.filter((request) => request.path === "/oauth/revoke")).toHaveLength(0);
	const encrypted = await readFile(new URL("credentials.enc", configDir), "utf8").catch(() => "");
	expect(encrypted).not.toBe("leftover");
	expect((await prismic("whoami")).exitCode).toBe(0);
});

// Collects the events the CLI sends to Sentry.
async function createFakeSentry() {
	const events: string[] = [];
	const server = createServer(async (req, res) => {
		let body = "";
		for await (const chunk of req) body += chunk;
		events.push(body);
		res.end("{}");
	});
	// Both loopback addresses, since `sentry.localhost` may resolve to either.
	await new Promise<void>((resolve) => server.listen(0, "::", resolve));
	const { port } = server.address() as AddressInfo;
	return {
		events,
		env: {
			PRISMIC_SENTRY_ENABLED: "true",
			// The DSN needs a domain name, not an IP address.
			PRISMIC_SENTRY_DSN: `http://key@sentry.localhost:${port}/1`,
		},
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}
