import type { ParseArgsOptionDescriptor } from "node:util";

import { parseArgs } from "node:util";

import { dedent } from "./string";

export type CommandConfig = {
	name: string;
	description: string;
	sections?: Record<string, string>;
	positionals?: Record<string, { description: string }>;
	options?: Record<string, ParseArgsOptionDescriptor & { description: string }>;
};

type CommandHandlerArgs<T extends CommandConfig> = ReturnType<
	typeof parseArgs<T & { allowPositionals: T["positionals"] extends undefined ? false : true }>
>;

export function createCommand<T extends CommandConfig>(
	config: T,
	handler: (args: CommandHandlerArgs<T>) => Promise<void>,
): () => Promise<void> {
	return async function () {
		const { positionals = {}, options } = config;

		const depth = config.name.split(" ").length;
		const args = process.argv.slice(1 + depth);
		const allowPositionals = Object.keys(positionals).length > 0;

		const result = parseArgs({
			args,
			options: {
				...options,
				help: { type: "boolean", short: "h" },
			},
			allowPositionals,
			strict: true,
		});

		if (result.values.help) {
			console.info(buildCommandHelp(config));
			return;
		}

		await handler(result as CommandHandlerArgs<T>);
	};
}

function buildCommandHelp(config: CommandConfig): string {
	const { description, sections, positionals = {}, options } = config;

	const positionalNames = Object.keys(positionals);

	const lines = [dedent(description)];

	lines.push("");
	lines.push("USAGE");
	let usage = `  ${config.name}`;
	if (positionalNames.length > 0) {
		usage += " " + positionalNames.map((positionalName) => `<${positionalName}>`).join(" ");
	}
	usage += " [options]";
	lines.push(usage);

	if (positionalNames.length > 0) {
		lines.push("");
		lines.push("ARGUMENTS");
		const maxNameLength = Math.max(
			...positionalNames.map((positionalName) => `<${positionalName}>`.length),
		);
		for (const positionalName in positionals) {
			const formattedName = `<${positionalName}>`;
			const paddedName = formattedName.padEnd(maxNameLength);
			const description = positionals[positionalName].description;
			lines.push(`  ${paddedName}   ${description}`);
		}
	}

	lines.push("");
	lines.push("OPTIONS");
	const optionEntries: { left: string; description: string }[] = [];
	if (options) {
		const optionNames = Object.keys(options);
		for (const optionName of optionNames) {
			const option = options[optionName];
			const shortPart = option.short ? `-${option.short}, ` : "    ";
			const typeSuffix = option.type === "string" ? " string" : "";
			const left = `${shortPart}--${optionName}${typeSuffix}`;
			optionEntries.push({ left, description: option.description });
		}
	}
	optionEntries.push({ left: "-h, --help", description: "Show help for command" });
	const maxOptionLength = Math.max(...optionEntries.map((optionEntry) => optionEntry.left.length));
	for (const optionEntry of optionEntries) {
		const paddedLeft = optionEntry.left.padEnd(maxOptionLength);
		lines.push(`  ${paddedLeft}   ${optionEntry.description}`);
	}

	if (sections) {
		for (const sectionName in sections) {
			const content = dedent(sections[sectionName]);
			lines.push("");
			lines.push(sectionName);
			for (const line of content.split("\n")) {
				lines.push(line ? `  ${line}` : "");
			}
		}
	}

	lines.push("");
	lines.push("LEARN MORE");
	const bin = config.name.split(" ")[0];
	lines.push(`  Use \`${bin} <command> --help\` for more information about a command.`);

	return lines.join("\n");
}

type CreateCommandRouterConfig = {
	name: string;
	description: string;
	commands: Record<string, RouterCommand>;
};
type RouterCommand = { handler: () => Promise<void>; description: string };

export function createCommandRouter(config: CreateCommandRouterConfig): () => Promise<void> {
	const { name, description, commands } = config;

	const depth = name.split(" ").length;

	return async function () {
		const args = process.argv.slice(1 + depth);

		const {
			positionals: [subcommand],
		} = parseArgs({
			args,
			options: { help: { type: "boolean", short: "h" } },
			allowPositionals: true,
			strict: false,
		});

		const entry = subcommand ? config.commands[subcommand] : undefined;
		if (entry) {
			await entry.handler();
			return;
		}

		if (subcommand) {
			throw new CommandError(`Unknown command: ${subcommand}`);
		}

		console.info(buildRouterHelp({ name, description, commands }));
	};
}

function buildRouterHelp(config: CreateCommandRouterConfig): string {
	const { name, description, commands } = config;

	const lines = [description];

	lines.push("");
	lines.push("USAGE");
	lines.push(`  ${name} <command> [options]`);

	lines.push("");
	lines.push("COMMANDS");
	const commandNames = Object.keys(commands);
	const maxNameLength = Math.max(...commandNames.map((commandName) => commandName.length));
	for (const commandName of commandNames) {
		const paddedName = commandName.padEnd(maxNameLength);
		const description = commands[commandName].description;
		lines.push(`  ${paddedName}   ${description}`);
	}

	lines.push("");
	lines.push("OPTIONS");
	lines.push("  -h, --help   Show help for command");

	lines.push("");
	lines.push("LEARN MORE");
	lines.push(`  Use \`${name} <command> --help\` for more information about a command.`);

	return lines.join("\n");
}

export class CommandError extends Error {
	name = "CommandError";
}
