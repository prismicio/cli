import { it } from "./it";
import { getRepository } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("preview", [
		"set-simulator",
		"--help",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic preview set-simulator <url> [flags]");
});

it("sets simulator URL", async ({ expect, prismic, repo, token, host }) => {
	const simulatorUrl = `https://test-${crypto.randomUUID()}.example.com/slice-simulator`;

	const { stdout, exitCode } = await prismic("preview", [
		"set-simulator",
		simulatorUrl,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Simulator URL set: ${simulatorUrl}`);

	const repository = await getRepository({ repo, token, host });
	expect(repository.simulator_url).toBe(simulatorUrl);
});

it("appends /slice-simulator to URL", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("preview", [
		"set-simulator",
		"https://example.com",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(
		"Simulator URL set: https://example.com/slice-simulator",
	);
});
