import { readFile } from "node:fs/promises";
import * as z from "zod/mini";

import { type Environment, getEnvironments } from "./clients/core";
import { getProfile } from "./clients/user";
import { ENVIRONMENTS_PATH } from "./config";
import { writeFileRecursive } from "./lib/file";
import { stringify } from "./lib/json";
import { findProjectRoot } from "./project";

const EnvironmentsSchema = z.partialRecord(z.string(), z.string());
export type Environments = z.infer<typeof EnvironmentsSchema>;

export async function getEnvironment(): Promise<string | undefined> {
	const projectRoot = await findProjectRoot();
	const environments = await readEnvironments();
	return environments[projectRoot.toString()];
}

export async function saveEnvironment(environment: string | undefined): Promise<void> {
	const projectRoot = await findProjectRoot();
	const environments = await readEnvironments();
	if (environment) {
		environments[projectRoot.toString()] = environment;
	} else {
		delete environments[projectRoot.toString()];
	}
	await writeFileRecursive(ENVIRONMENTS_PATH, stringify(environments));
}

async function readEnvironments(): Promise<Environments> {
	try {
		const contents = await readFile(ENVIRONMENTS_PATH, "utf-8");
		const json = JSON.parse(contents);
		return z.parse(EnvironmentsSchema, json);
	} catch {
		return {};
	}
}

export async function getUserEnvironments(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<Environment[]> {
	const { repo, token, host } = config;
	const [profile, environments] = await Promise.all([
		getProfile({ token, host }),
		getEnvironments({ repo, token, host }),
	]);
	const userEnvironments = environments.filter(
		(environment) =>
			(environment.kind === "prod" || environment.kind === "stage") &&
			environment.users.some((user) => user.id === profile.shortId),
	);
	return userEnvironments;
}

export async function resolveEnvironment(
	env: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<string> {
	const availableEnvironments = await getUserEnvironments(config);
	const match = availableEnvironments.find((environment) => environment.domain === env);
	if (match) return match.domain;

	throw new InvalidEnvironmentError(env, availableEnvironments, config.repo);
}

export class InvalidEnvironmentError extends Error {
	name = "InvalidEnvironmentError";
	repo: string;
	env: string;
	availableEnvironments: Environment[];
	constructor(env: string, availableEnvironments: Environment[], repo: string) {
		super();
		this.repo = repo;
		this.env = env;
		this.availableEnvironments = availableEnvironments;
	}
}
