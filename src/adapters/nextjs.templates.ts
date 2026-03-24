import { pascalCase } from "change-case";

import { dedent } from "../lib/string";

const SLICE_MARKUP = dedent`
	return (
		<section
			data-slice-type={slice.slice_type}
			data-slice-variation={slice.variation}
		>
			Placeholder component for {slice.slice_type} (variation: {slice.variation}) slices.
			<br />
			<strong>You can edit this slice directly in your code editor.</strong>
		</section>
	)
`;

export function sliceTemplate(args: { name: string; typescript: boolean }): string {
	const { name, typescript } = args;

	const pascalName = pascalCase(name);

	const TS = dedent`
		import { FC } from "react";
		import { Content } from "@prismicio/client";
		import { SliceComponentProps } from "@prismicio/react";

		/**
		 * Props for \`${pascalName}\`.
		 */
		export type ${pascalName}Props = SliceComponentProps<Content.${pascalName}Slice>;

		/**
		 * Component for "${name}" Slices.
		 */
		const ${pascalName}: FC<${pascalName}Props> = ({ slice }) => {
			${SLICE_MARKUP}
		};

		export default ${pascalName}
	`;

	const JS = dedent`
		/**
		 * @typedef {import("@prismicio/client").Content.${pascalName}Slice} ${pascalName}Slice
		 * @typedef {import("@prismicio/react").SliceComponentProps<${pascalName}Slice>} ${pascalName}Props
		 * @type {import("react").FC<${pascalName}Props>}
		 */
		const ${pascalName} = ({ slice }) => {
			${SLICE_MARKUP}
		};

		export default ${pascalName};
	`;

	return typescript ? TS : JS;
}

export function prismicIOFileTemplate(args: {
	typescript: boolean;
	appRouter: boolean;
	hasSrcDirectory: boolean;
}): string {
	const { typescript, appRouter, hasSrcDirectory } = args;
	const configImportPath = `${hasSrcDirectory ? ".." : "."}/prismic.config.json`;

	let importsContents: string;
	let createClientContents: string;

	if (appRouter) {
		if (typescript) {
			importsContents = dedent`
				import {
					createClient as baseCreateClient,
					type ClientConfig,
				} from "@prismicio/client";
				import { enableAutoPreviews } from "@prismicio/next";
				import prismicConfig from "${configImportPath}";
			`;

			createClientContents = dedent`
				/**
				 * Creates a Prismic client for the project's repository. The client is used to
				 * query content from the Prismic API.
				 *
				 * @param config - Configuration for the Prismic client.
				 */
				export const createClient = (config: ClientConfig = {}) => {
					const client = baseCreateClient(repositoryName, {
						routes: prismicConfig.routes,
						fetchOptions:
							process.env.NODE_ENV === 'production'
								? { next: { tags: ['prismic'] }, cache: 'force-cache' }
								: { next: { revalidate: 5 } },
						...config,
					});

					enableAutoPreviews({ client });

					return client;
				};
			`;
		} else {
			importsContents = dedent`
				import { createClient as baseCreateClient } from "@prismicio/client";
				import { enableAutoPreviews } from "@prismicio/next";
				import prismicConfig from "${configImportPath}";
			`;

			createClientContents = dedent`
				/**
				 * Creates a Prismic client for the project's repository. The client is used to
				 * query content from the Prismic API.
				 *
				 * @param {import("@prismicio/client").ClientConfig} config - Configuration for the Prismic client.
				 */
				export const createClient = (config = {}) => {
					const client = baseCreateClient(repositoryName, {
						routes: prismicConfig.routes,
						fetchOptions:
							process.env.NODE_ENV === 'production'
								? { next: { tags: ['prismic'] }, cache: 'force-cache' }
								: { next: { revalidate: 5 } },
						...config,
					});

					enableAutoPreviews({ client });

					return client;
				};
			`;
		}
	} else {
		if (typescript) {
			importsContents = dedent`
				import { createClient as baseCreateClient } from "@prismicio/client";
				import { enableAutoPreviews, type CreateClientConfig } from "@prismicio/next/pages";
				import prismicConfig from "${configImportPath}";
			`;

			createClientContents = dedent`
				/**
				 * Creates a Prismic client for the project's repository. The client is used to
				 * query content from the Prismic API.
				 *
				 * @param config - Configuration for the Prismic client.
				 */
				export const createClient = ({ previewData, req, ...config }: CreateClientConfig = {}) => {
					const client = baseCreateClient(repositoryName, {
						routes: prismicConfig.routes,
						...config,
					});

					enableAutoPreviews({ client, previewData, req });

					return client;
				};
			`;
		} else {
			importsContents = dedent`
				import { createClient as baseCreateClient } from "@prismicio/client";
				import { enableAutoPreviews } from "@prismicio/next/pages";
				import prismicConfig from "${configImportPath}";
			`;

			createClientContents = dedent`
				/**
				 * Creates a Prismic client for the project's repository. The client is used to
				 * query content from the Prismic API.
				 *
				 * @param {import("@prismicio/next/pages").CreateClientConfig} config - Configuration for the Prismic client.
				 */
				export const createClient = ({ previewData, req, ...config } = {}) => {
					const client = baseCreateClient(repositoryName, {
						routes: prismicConfig.routes,
						...config,
					});

					enableAutoPreviews({ client, previewData, req });

					return client;
				};
			`;
		}
	}

	if (typescript) {
		return dedent`
			${importsContents}

			/**
			 * The project's Prismic repository name.
			 */
			export const repositoryName = prismicConfig.repositoryName;

			${createClientContents}
		`;
	}

	return dedent`
		${importsContents}

		/**
		 * The project's Prismic repository name.
		 */
		export const repositoryName = prismicConfig.repositoryName;

		${createClientContents}
	`;
}

export function sliceSimulatorPageTemplate(args: {
	typescript: boolean;
	appRouter: boolean;
}): string {
	const { typescript, appRouter } = args;

	const appTS = dedent`
		import { SliceSimulator, SliceSimulatorParams, getSlices } from "@prismicio/next";
		import { SliceZone } from "@prismicio/react";

		import { components } from "../../slices";

		export default async function SliceSimulatorPage({
			searchParams,
		}: SliceSimulatorParams) {
			const { state } = await searchParams
			const slices = getSlices(state);

			return (
				<SliceSimulator>
					<SliceZone slices={slices} components={components} />
				</SliceSimulator>
			);
		}
	`;

	const appJS = dedent`
		import { SliceSimulator, getSlices } from "@prismicio/next";
		import { SliceZone } from "@prismicio/react";

		import { components } from "../../slices";

		export default async function SliceSimulatorPage({ searchParams }) {
			const { state } = await searchParams
			const slices = getSlices(state);

			return (
				<SliceSimulator>
					<SliceZone slices={slices} components={components} />
				</SliceSimulator>
			);
		}
	`;

	const pages = dedent`
		import { SliceSimulator } from "@prismicio/next/pages";
		import { SliceZone } from "@prismicio/react";

		import { components } from "../slices";

		export default function SliceSimulatorPage() {
			return (
				<SliceSimulator
					sliceZone={(props) => <SliceZone {...props} components={components} />}
				/>
			);
		}
	`;

	if (appRouter) {
		return typescript ? appTS : appJS;
	} else {
		return pages;
	}
}

export function previewRouteTemplate(args: { typescript: boolean; appRouter: boolean }): string {
	const { typescript, appRouter } = args;

	const appTS = dedent`
		import { NextRequest } from "next/server";
		import { redirectToPreviewURL } from "@prismicio/next";

		import { createClient } from "../../../prismicio";

		export async function GET(request: NextRequest) {
			const client = createClient();

			return await redirectToPreviewURL({ client, request });
		}
	`;

	const appJS = dedent`
		import { redirectToPreviewURL } from "@prismicio/next";

		import { createClient } from "../../../prismicio";

		export async function GET(request) {
			const client = createClient();

			return await redirectToPreviewURL({ client, request });
		}
	`;

	const pagesTS = dedent`
		import { NextApiRequest, NextApiResponse } from "next";
		import { setPreviewData, redirectToPreviewURL } from "@prismicio/next/pages";

		import { createClient } from "../../prismicio";

		export default async function handler(req: NextApiRequest, res: NextApiResponse) {
			const client = createClient({ req });

			setPreviewData({ req, res });

			return await redirectToPreviewURL({ req, res, client });
		};
	`;

	const pagesJS = dedent`
		import { setPreviewData, redirectToPreviewURL } from "@prismicio/next/pages";

		import { createClient } from "../../prismicio";

		export default async function handler(req, res) {
			const client = createClient({ req });

			setPreviewData({ req, res });

			return await redirectToPreviewURL({ req, res, client });
		};
	`;

	if (appRouter) {
		return typescript ? appTS : appJS;
	} else {
		return typescript ? pagesTS : pagesJS;
	}
}

export function exitPreviewRouteTemplate(args: {
	typescript: boolean;
	appRouter: boolean;
}): string {
	const { typescript, appRouter } = args;

	const app = dedent`
		import { exitPreview } from "@prismicio/next";

		export function GET() {
			return exitPreview();
		}
	`;

	const pagesTS = dedent`
		import { NextApiRequest, NextApiResponse } from "next";
		import { exitPreview } from "@prismicio/next/pages";

		export default function handler(req: NextApiRequest, res: NextApiResponse) {
			return exitPreview({ req, res });
		}
	`;

	const pagesJS = dedent`
		import { exitPreview } from "@prismicio/next/pages";

		export default function handler(req, res) {
			return exitPreview({ req, res });
		}
	`;

	if (appRouter) {
		return app;
	} else {
		return typescript ? pagesTS : pagesJS;
	}
}

export function revalidateRouteTemplate(args: { supportsCacheLife: boolean }): string {
	const { supportsCacheLife } = args;

	return dedent`
		import { NextResponse } from "next/server";
		import { revalidateTag } from "next/cache";

		export async function POST() {
			revalidateTag("prismic"${supportsCacheLife ? ', "max"' : ""});

			return NextResponse.json({ revalidated: true, now: Date.now() });
		}
	`;
}
