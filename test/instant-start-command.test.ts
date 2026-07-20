import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	extractZip: vi.fn(),
	exists: vi.fn(),
	getCredentials: vi.fn(),
	getOrCreateInstantStartExport: vi.fn(),
	getProfile: vi.fn(),
	installDependencies: vi.fn(),
	mkdir: vi.fn(),
	provisionInstantStart: vi.fn(),
	readURLFile: vi.fn(),
	rm: vi.fn(),
	setSimulatorUrl: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdir, rm: mocks.rm }));
vi.mock("../src/auth", () => ({ getCredentials: mocks.getCredentials }));
vi.mock("../src/lib/file", () => ({
	exists: mocks.exists,
	readURLFile: mocks.readURLFile,
}));
vi.mock("../src/lib/packageJson", () => ({
	installDependencies: mocks.installDependencies,
}));
vi.mock("../src/lib/prismic/clients/core", () => ({
	setSimulatorUrl: mocks.setSimulatorUrl,
}));
vi.mock("../src/lib/prismic/clients/user", () => ({
	getProfile: mocks.getProfile,
}));
vi.mock("../src/lib/prismic/clients/website-generator", () => ({
	getOrCreateInstantStartExport: mocks.getOrCreateInstantStartExport,
	provisionInstantStart: mocks.provisionInstantStart,
}));
vi.mock("../src/lib/zip", () => ({ extractZip: mocks.extractZip }));

import { runInstantStart } from "../src/commands/instant-start";

describe.sequential("Instant Start command", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.spyOn(console, "info").mockImplementation(() => {});
		mocks.getCredentials.mockResolvedValue({
			token: "test-token",
			host: "prismic.io",
		});
		mocks.getProfile.mockResolvedValue({ email: "test@example.com" });
		mocks.exists.mockResolvedValue(false);
		mocks.getOrCreateInstantStartExport.mockResolvedValue({
			status: "ready",
			framework: "next",
			preparedAt: "2026-07-17T10:00:00.000Z",
			downloadUrl: "https://cdn.example.com/my-repo/.exports/instant-start.zip",
		});
		mocks.readURLFile.mockResolvedValue(new Blob(["zip"]));
	});

	it("sets up an existing repository without provisioning another one", async () => {
		await runInstantStart({ repositoryToExport: "My-Repo" });

		expect(mocks.provisionInstantStart).not.toHaveBeenCalled();
		expect(mocks.getOrCreateInstantStartExport).toHaveBeenCalledWith("my-repo", {
			token: "test-token",
			host: "prismic.io",
		});
		const destination = resolve(process.cwd(), "my-repo");
		expect(mocks.extractZip).toHaveBeenCalledWith(
			new Uint8Array(new TextEncoder().encode("zip")),
			destination,
		);
		expect(mocks.installDependencies).toHaveBeenCalledWith({
			start: pathToFileURL(destination),
		});
		expect(mocks.setSimulatorUrl).toHaveBeenCalledWith("http://localhost:3000/slice-simulator", {
			repo: "my-repo",
			token: "test-token",
			host: "prismic.io",
		});
	});

	it("prints a recovery command when local setup fails after provisioning", async () => {
		mocks.provisionInstantStart.mockResolvedValue({
			repositoryId: "new-repo",
			repositoryUrl: "https://new-repo.prismic.io",
		});
		mocks.getOrCreateInstantStartExport.mockResolvedValue({
			status: "ready",
			framework: "next",
			preparedAt: "2026-07-17T10:00:00.000Z",
			downloadUrl: "https://cdn.example.com/new-repo/.exports/instant-start.zip",
		});
		mocks.installDependencies.mockRejectedValue(new Error("install failed"));
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(runInstantStart({})).rejects.toThrow("install failed");
		expect(consoleError).toHaveBeenCalledWith(
			'Repository "new-repo" was created. Retry setup with:\n' +
				"  npx prismic@latest instant-start --export new-repo",
		);
		expect(mocks.rm).toHaveBeenCalledWith(resolve(process.cwd(), "new-repo"), {
			recursive: true,
			force: true,
		});
	});
});
