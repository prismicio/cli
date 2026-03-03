import { spawn } from "node:child_process";

import { parseNi } from "@antfu/ni";

import { PackageManager } from "../types";

const EXTRA_INSTALL_FLAGS: Record<PackageManager, string[]> = {
	npm: ["--color=always", "--loglevel=info"],
	pnpm: [],
	yarn: [],
	"yarn@berry": [],
	"pnpm@6": [],
	bun: [],
	deno: [],
};

type InstallDependenciesArgs = {
	packageManager: PackageManager;
	dependencies: Record<string, string>;
	dev?: boolean;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
};

type ResultPromise = Promise<void> & {
	stdout: NodeJS.ReadableStream | null;
	stderr: NodeJS.ReadableStream | null;
};

type InstallDependenciesReturnType = {
	execaProcess: ResultPromise;
};

const resolveCommand = (
	command: string | { command: string; args: string[] },
): string => {
	if (typeof command === "string") {
		return command;
	}

	return [command.command, ...command.args].join(" ");
};

export const installDependencies = async (
	args: InstallDependenciesArgs,
): Promise<InstallDependenciesReturnType> => {
	const commandArgs = Object.entries(args.dependencies).map(
		([pkg, range]) => `${pkg}@${range}`,
	);

	if (commandArgs.length && args.dev) {
		commandArgs.unshift("-D");
	}

	commandArgs.push(...EXTRA_INSTALL_FLAGS[args.packageManager]);

	const parsedCommand = await parseNi(args.packageManager, commandArgs);

	if (!parsedCommand) {
		throw new Error(
			"Failed to begin dependency installation (could not parse command)",
			{
				cause: {
					packageManager: args.packageManager,
					dependencies: args.dependencies,
				},
			},
		);
	}

	const parsed = resolveCommand(parsedCommand);

	let command: string;

	if (typeof parsedCommand === "object" && parsedCommand !== null) {
		command = [parsedCommand.command, ...parsedCommand.args].join(" ");
	} else {
		command = parsed;
	}

	const childProcess = spawn(command, {
		cwd: args.cwd || process.cwd(),
		env: { ...process.env, ...args.env },
		stdio: ["ignore", "pipe", "pipe"],
		shell: true,
	});

	const promise = new Promise<void>((resolve, reject) => {
		childProcess.on("error", (error) => {
			reject(error);
		});

		childProcess.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				const error = new Error(`Command failed with exit code ${code}`);
				Object.assign(error, {
					shortMessage: `Command failed: ${parsed}`,
					stderr: "",
				});
				reject(error);
			}
		});
	}) as ResultPromise;

	promise.stdout = childProcess.stdout;
	promise.stderr = childProcess.stderr;

	return {
		execaProcess: promise,
	};
};
