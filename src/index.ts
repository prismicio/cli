#!/usr/bin/env node

import { parseArgs } from "node:util";

main();

function main() {
	const args = getArgs();
	if (args.error) {
		console.error(args.error.message);
		process.exitCode = 1;
		return;
	}

	if (args.values.help || args.positionals.length < 1) {
		printHelp();
		process.exitCode = 0;
	}
}

function printHelp() {
	console.info(
		`
Usage: prismic <command>

Commands:
  (none yet)

Options:
  -h, --help  Show this help message
`.trim(),
	);
}

function getArgs() {
	try {
		return {
			error: undefined,
			...parseArgs({
				options: {
					help: { type: "boolean", short: "h" },
				},
				allowPositionals: true,
			}),
		};
	} catch (error) {
		if (error instanceof Error) {
			return { error };
		}

		throw error;
	}
}
