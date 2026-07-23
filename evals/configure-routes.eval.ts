import { readFile } from "node:fs/promises";

import { buildCustomType, writeLocalCustomType } from "../test/it";
import { it, trials } from "./it";

it.for(trials)(
	"routes a nested URL through a content relationship",
	async (_, { project, agent, expect }) => {
		const category = buildCustomType({ id: "category", label: "Category" });
		const blogPost = buildCustomType({
			id: "blog_post",
			label: "Blog Post",
			json: {
				Main: {
					category: {
						type: "Link",
						config: { label: "Category", select: "document", customtypes: ["category"] },
					},
				},
			},
		});
		await writeLocalCustomType(project, category);
		await writeLocalCustomType(project, blogPost);

		await agent(
			`Blog posts should live at /blog/<category>/<post>, where <category> is the linked category's UID and <post> is the post's UID.`,
		);

		const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf8"));
		const route = config.routes?.find((route: { type: string }) => route.type === "blog_post");
		expect(route?.path).toBe("/blog/:category/:uid");
		expect(route?.resolvers).toEqual({ category: "category" });
	},
);

// Fails: the agent never writes the optional-locale route ("/:lang?/:uid").
it.for(trials)(
	"routes non-default locales with an optional locale prefix",
	async (_, { project, agent, expect }) => {
		const page = buildCustomType({ id: "page", label: "Page" });
		await writeLocalCustomType(project, page);

		await agent(
			`Pages live at /<uid>. Non-default locales should get a locale prefix, like /fr-fr/<uid>, while the default locale stays at /<uid>.`,
		);

		const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf8"));
		const route = config.routes?.find((route: { type: string }) => route.type === "page");
		expect(route?.path).toBe("/:lang?/:uid");
	},
);

it.for(trials)(
	"routes the home document to the root URL",
	async (_, { project, agent, expect }) => {
		const page = buildCustomType({ id: "page", label: "Page" });
		await writeLocalCustomType(project, page);

		await agent(`The "home" page document should be served at /, and every other page at /<uid>.`);

		const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf8"));
		const routes: { type: string; path: string; uid?: string }[] =
			config.routes?.filter((route: { type: string }) => route.type === "page") ?? [];
		const home = routes.find((route) => route.uid === "home");
		expect(home?.path).toBe("/");
		expect(routes.some((route) => route.path === "/:uid" && route.uid === undefined)).toBe(true);
	},
);
