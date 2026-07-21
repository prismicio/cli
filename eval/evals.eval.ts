// Evals are measurements, not gates: an enabled eval may fail, and its pass
// rate is the signal. Drafts start as it.skip until validated once; keep an
// eval skipped only when the CLI cannot pass it (missing feature).

import dedent from "dedent";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";

import {
	buildCustomType,
	buildSlice,
	readLocalCustomType,
	readLocalCustomTypes,
	readLocalSlice,
	readLocalSlices,
	writeLocalCustomType,
	writeLocalSlice,
} from "../test/it";
import {
	addPreview,
	getAccessTokens,
	getCustomTypes,
	getLocales,
	getPreviews,
	getRepository,
	getWebhooks,
	insertCustomType,
} from "../test/prismic";
import { it, trials } from "./it";

it.for(trials)(
	"initializes Prismic in a Next.js project",
	async (_, { project, agent, expect }) => {
		await rm(new URL("prismic.config.json", project));

		const result = await agent(`Set up Prismic in this Next.js project.`);

		expect(result).toHaveRun("prismic", ["init"]);
		const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf8"));
		expect(config.repositoryName).toBeTruthy();
	},
);

it.for(trials)(
	"adds Prismic to an existing Next.js app without clobbering it",
	async (_, { project, agent, expect }) => {
		await rm(new URL("prismic.config.json", project));
		const existingPage = `export default function Home() {\n\treturn <main>KEEP-ME</main>;\n}\n`;
		await writeFile(new URL("app/page.tsx", project), existingPage);

		const result = await agent(`Add Prismic to this existing Next.js app.`);

		expect(result).toHaveRun("prismic", ["init"]);
		const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf8"));
		expect(config.repositoryName).toBeTruthy();
		const page = await readFile(new URL("app/page.tsx", project), "utf8");
		expect(page).toContain("KEEP-ME");
	},
);

it.for(trials)(
	"initializes with an existing repository",
	async (_, { project, agent, expect, repo }) => {
		await rm(new URL("prismic.config.json", project));

		const result = await agent(
			`Set up Prismic in this project using the existing "${repo}" Prismic repository.`,
		);

		expect(result).toHaveRun("prismic", ["init"]);
		const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf8"));
		expect(config.repositoryName).toBe(repo);
	},
);

it.for(trials)(
	"models a testimonial slice from a text description",
	async (_, { project, agent, expect }) => {
		const result = await agent(
			`Create a testimonial slice: a quote, author name, author role, an avatar, and a company logo.`,
		);

		expect(result).toHaveRun("prismic", ["slice", "create"]);
		const slices = await readLocalSlices(project);
		expect(slices.length).toBe(1);
		await expect(JSON.stringify(slices[0], null, 2)).toSatisfyJudge(
			dedent`
			This is a Prismic shared slice modeled from: "a testimonial with a quote, author name, author role, an avatar, and a company logo".
			Passes if all five are present with sensible types: rich text or key text for the quote, key text for the name and role, and image fields for the avatar and logo. Field names may vary; judge the types, not the names.
		`,
		);
	},
);

it.todo("models a slice from a screenshot");

it.for(trials)(
	"models a page type with sensible field types",
	async (_, { project, agent, expect }) => {
		const author = buildCustomType({ id: "author", label: "Author" });
		await writeLocalCustomType(project, author);

		const result = await agent(
			`model a Prismic blog post: a title, publish date, hero image, author, and body`,
		);

		expect(result).toHaveRun("prismic", ["type", "create"]);
		const models = (await readLocalCustomTypes(project)).filter((model) => model.id !== author.id);

		await expect(JSON.stringify(models, null, 2)).toSatisfyJudge(
			dedent`
			These are Prismic models for a blog post with a title, publish date, hero image, author, and body.
			Passes if the title and body are rich text, the publish date is a date or timestamp, the hero is an image, and the author is a content relationship (a link to another document type), not free text.
		`,
		);
	},
);

it.for(trials)(
	"models pages as page types and data as custom types",
	async (_, { project, agent, expect }) => {
		const result = await agent(`Model a landing page and a global navigation menu.`);

		expect(result).toHaveRun("prismic", ["type", "create"]);
		const models = await readLocalCustomTypes(project);
		const landingPage = models.find((model) => /landing/.test(model.id));
		const navigation = models.find((model) => /nav/.test(model.id));
		expect(landingPage?.format).toBe("page");
		expect(landingPage?.repeatable).toBe(true);
		expect(navigation?.format).not.toBe("page");
		expect(navigation?.repeatable).toBe(false);
	},
);

it.for(trials)(
	"handles a vague design request reasonably",
	async (_, { project, agent, expect }) => {
		const homepage = buildCustomType({ id: "homepage", label: "Homepage", repeatable: false });
		await writeLocalCustomType(project, homepage);

		const result = await agent(`The homepage needs a flexible hero.`);

		expect(result).toHaveRun("prismic");
		const models = await readLocalCustomTypes(project);
		const slices = await readLocalSlices(project);
		await expect(JSON.stringify({ models, slices }, null, 2)).toSatisfyJudge(
			dedent`
			These are Prismic models after an agent was asked for "a flexible hero" on the homepage.
			Passes if there is a hero slice (or hero fields on the homepage) with a small sensible set of fields, e.g. heading, description, image, and a call-to-action link. Variations are a plus but not required.
			Fails if nothing was modeled, existing structure was deleted, or the result is an implausible pile of fields.
		`,
		);
	},
);

it.for(trials)(
	"picks appropriate field types for a rating and a CTA",
	async (_, { project, agent, expect }) => {
		const product = buildCustomType({ id: "product", label: "Product" });
		await writeLocalCustomType(project, product);

		const result = await agent(
			`Add a star rating (1 to 5) and a call-to-action button to the "product" type.`,
		);

		expect(result).toHaveRun("prismic", ["field", "add"]);
		const model = await readLocalCustomType(project, product.id);
		await expect(JSON.stringify(model, null, 2)).toSatisfyJudge(
			dedent`
			This is a Prismic "product" model after adding a star rating (1 to 5) and a call-to-action button.
			Passes only if both hold: the rating is a number field or a select constrained to the values 1-5 (not free text), and the CTA is a single link field (ideally with display text), not separate text and URL fields.
		`,
		);
	},
);

// Fails: the agent models the title as key text instead of single-heading rich text.
it.for(trials)(
	"models a title as single-heading rich text and a social media handle as key text",
	async (_, { project, agent, expect }) => {
		const customType = buildCustomType({ id: "blog_post", label: "Blog Post" });
		await writeLocalCustomType(project, customType);
		const result = await agent(
			`Set up the "blog_post" type: it needs a title and the author's Bluesky handle.`,
		);
		expect(result).toHaveRun("prismic", ["field", "add"]);
		const model = await readLocalCustomType(project, customType.id);

		await expect(JSON.stringify(model, null, 2)).toSatisfyJudge(
			dedent`
			This is a Prismic "blog_post" model that needs a title.
			By Prismic convention, passes only if the title is rich text (type "StructuredText") limited to a single heading block.
			Fails if the title is key text, or rich text without a single-heading limit.
		`,
		);
		await expect(JSON.stringify(model, null, 2)).toSatisfyJudge(
			dedent`
			This is a Prismic "blog_post" model that needs the author's Bluesky handle.
			Passes only if the handle is key text (type "Text"): a short single-line string with no formatting.
			Fails if the handle is rich text.
		`,
		);
	},
);

it.for(trials)("adds a field", async (_, { project, agent, expect }) => {
	const article = buildCustomType({
		id: "article",
		label: "Article",
		json: {
			Main: {
				title: { type: "StructuredText", config: { label: "Title", single: "heading1" } },
				published_at: { type: "Date", config: { label: "Published At" } },
			},
		},
	});
	await writeLocalCustomType(project, article);

	const result = await agent(`Add an "excerpt" rich text field to the "article" type.`);

	expect(result).toHaveRun("prismic", ["field", "add", "rich-text", "excerpt"]);
	const model = await readLocalCustomType(project, article.id);
	expect(model.json.Main.excerpt.type).toBe("StructuredText");
	expect(model.json.Main.title).toEqual(article.json.Main.title);
	expect(model.json.Main.published_at).toEqual(article.json.Main.published_at);
});

it.for(trials)(
	"adds a slice variation without losing existing ones",
	async (_, { project, agent, expect }) => {
		const slice = buildSlice({ id: "hero", name: "Hero" });
		slice.variations = [
			...slice.variations,
			{ ...slice.variations[0], id: "imageRight", name: "Image Right" },
		];
		await writeLocalSlice(project, slice);

		const result = await agent(`Add a "centered" variation to the "Hero" slice.`);

		expect(result).toHaveRun("prismic", ["slice", "add-variation"]);
		const model = await readLocalSlice(project, slice.id);
		const ids = model?.variations.map((variation) => variation.id);
		expect(ids).toContain("default");
		expect(ids).toContain("imageRight");
		expect(ids?.some((id) => /centered/i.test(id))).toBe(true);
	},
);

// Fails: the CLI cannot rename a field ID; `field edit` only changes label and config.
it.skip("renames a field without disturbing field order", async ({ project, agent, expect }) => {
	const article = buildCustomType({
		id: "article",
		label: "Article",
		json: {
			Main: {
				title: { type: "StructuredText", config: { label: "Title", single: "heading1" } },
				tagline: { type: "Text", config: { label: "Tagline" } },
				body: { type: "StructuredText", config: { label: "Body", multi: "paragraph" } },
			},
		},
	});
	await writeLocalCustomType(project, article);

	const result = await agent(`Rename the "tagline" field on "article" to "subtitle".`);

	expect(result).toHaveRun("prismic", ["field", "edit"]);
	const model = await readLocalCustomType(project, article.id);
	expect(Object.keys(model.json.Main)).toEqual(["title", "subtitle", "body"]);
	expect(model.json.Main.subtitle.type).toBe("Text");
});

it.for(trials)(
	"extends a slice to match a design change",
	async (_, { project, agent, expect }) => {
		const slice = buildSlice({ id: "testimonial", name: "Testimonial" });
		slice.variations[0].primary = {
			quote: { type: "StructuredText", config: { label: "Quote", multi: "paragraph" } },
			author: { type: "Text", config: { label: "Author" } },
		};
		await writeLocalSlice(project, slice);

		const result = await agent(
			`The testimonial design now also shows the author's company logo and a star rating. Update the "Testimonial" slice.`,
		);

		expect(result).toHaveRun("prismic", ["field", "add"]);
		const model = await readLocalSlice(project, slice.id);
		const primary = model?.variations[0].primary ?? {};
		expect(primary.quote).toEqual(slice.variations[0].primary.quote);
		expect(primary.author).toEqual(slice.variations[0].primary.author);
		const addedTypes = Object.values(primary).map((field) => field.type);
		expect(addedTypes).toContain("Image");
	},
);

it.for(trials)(
	"is idempotent when the same task runs twice",
	async (_, { project, agent, expect }) => {
		const homepage = buildCustomType({ id: "homepage", label: "Homepage" });
		await writeLocalCustomType(project, homepage);

		const firstRun = await agent(`add a "body" rich text field to "homepage"`);
		await agent(`add a "body" rich text field to "homepage"`);

		expect(firstRun).toHaveRun("prismic", ["field", "add"]);
		const model = await readLocalCustomType(project, homepage.id);
		const bodyLikeKeys = Object.keys(model.json.Main).filter((key) => /body/i.test(key));
		expect(bodyLikeKeys).toEqual(["body"]);
		expect(model.json.Main.body.type).toBe("StructuredText");
	},
);

it.for(trials)("adds a group field with nested fields", async (_, { project, agent, expect }) => {
	const product = buildCustomType({ id: "product", label: "Product" });
	await writeLocalCustomType(project, product);

	const result = await agent(
		`Add a repeatable "features" group to the "product" type. Each feature has an icon image and a label.`,
	);

	expect(result).toHaveRun("prismic", ["field", "add", "group"]);
	const model = await readLocalCustomType(project, product.id);
	const features = model.json.Main.features;
	expect(features.type).toBe("Group");
	const nestedTypes = Object.values(
		(features.config as { fields: Record<string, { type: string }> }).fields,
	).map((field) => field.type);
	expect(nestedTypes).toContain("Image");
	expect(nestedTypes).toContain("Text");
});

it.for(trials)(
	"adds constrained fields with the right config",
	async (_, { project, agent, expect }) => {
		const author = buildCustomType({ id: "author", label: "Author" });
		const product = buildCustomType({ id: "product", label: "Product" });
		await writeLocalCustomType(project, author);
		await writeLocalCustomType(project, product);

		const result = await agent(
			`On the "product" type, add a "size" dropdown with the options S, M, and L, and an "author" link that can only point to "author" documents.`,
		);

		expect(result).toHaveRun("prismic", ["field", "add", "select"]);
		expect(result).toHaveRun("prismic", ["field", "add", "content-relationship"]);
		const model = await readLocalCustomType(project, product.id);
		expect(model.json.Main.size.type).toBe("Select");
		expect((model.json.Main.size.config as { options: string[] }).options).toEqual(["S", "M", "L"]);
		expect(model.json.Main.author.type).toBe("Link");
		expect(JSON.stringify(model.json.Main.author.config)).toContain("author");
	},
);

it.for(trials)("writes a slice component", async (_, { project, agent, expect }) => {
	const slice = buildSlice({ id: "testimonial", name: "Testimonial" });
	slice.variations[0].primary = {
		quote: { type: "StructuredText", config: { label: "Quote", multi: "paragraph" } },
		avatar: { type: "Image", config: { label: "Avatar" } },
		attribution: { type: "Text", config: { label: "Attribution" } },
	};
	await writeLocalSlice(project, slice);

	await agent(`Create the React component for the "Testimonial" slice.`);

	const dir = new URL("slices/Testimonial/", project);
	const files = await readdir(dir);
	const componentFile = files.find((file) => /\.(t|j)sx$/.test(file));
	expect(componentFile).toBeTruthy();
	const component = await readFile(new URL(componentFile!, dir), "utf8");
	expect(component).toContain("quote");
	expect(component).toContain("avatar");
	expect(component).toContain("attribution");
	await expect(component).toSatisfyJudge(
		dedent`
			This is a React component for a Prismic slice with a rich text "quote" field, an image "avatar" field, and a key text "attribution" field.
			Passes if it follows Prismic conventions: renders the quote with PrismicRichText (not raw text), renders the avatar with PrismicNextImage or PrismicImage (not next/image or <img>), and receives the slice via props.
		`,
	);
});

it.for(trials)(
	"consults the docs before an unfamiliar task",
	async (_, { project, agent, expect }) => {
		const homepage = buildCustomType({ id: "homepage", label: "Homepage" });
		await writeLocalCustomType(project, homepage);

		const result = await agent(
			`Set up content previews for this project so editors can preview drafts.`,
		);

		expect(result).toHaveRun("prismic", ["docs"]);
	},
);

it.for(trials)(
	"uses the documented config for a single-heading constraint",
	async (_, { project, agent, expect }) => {
		const post = buildCustomType({
			id: "post",
			label: "Post",
			json: {
				Main: {
					title: {
						type: "StructuredText",
						config: { label: "Title", multi: "heading1,heading2,paragraph" },
					},
				},
			},
		});
		await writeLocalCustomType(project, post);

		const result = await agent(
			`Restrict the "title" field on "post" so editors can only write a single H1.`,
		);

		expect(result).toHaveRun("prismic", ["field", "edit"]);
		const model = await readLocalCustomType(project, post.id);
		const config = model.json.Main.title.config as { single?: string; multi?: string };
		expect(config.single).toBe("heading1");
		expect(config.multi).toBeUndefined();
	},
);

it.for(trials)("connects a slice to a page type", async (_, { project, agent, expect }) => {
	const page = buildCustomType({
		id: "page",
		label: "Page",
		json: { Main: { slices: { type: "Slices", fieldset: "Slice Zone", config: { choices: {} } } } },
	});
	await writeLocalCustomType(project, page);
	const slice = buildSlice({ id: "testimonial", name: "Testimonial" });
	await writeLocalSlice(project, slice);

	const result = await agent(`Make the "Testimonial" slice available on the "page" type.`);

	expect(result).toHaveRun("prismic", ["slice", "connect"]);
	const model = await readLocalCustomType(project, page.id);
	const choices = (model.json.Main.slices.config as { choices: Record<string, unknown> }).choices;
	expect(Object.keys(choices)).toContain(slice.id);
});

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

it.todo("wires a page that passes a production build");

it.for(trials)("sets up a content preview", async (_, { agent, expect, repo, token, host }) => {
	const result = await agent(
		`Set up a content preview for this repo pointing at https://example.com/api/preview.`,
	);

	expect(result).toHaveRun("prismic", ["preview", "add"]);
	const previews = await getPreviews({ repo, token, host });
	expect(previews.some((preview) => preview.url.includes("example.com"))).toBe(true);
});

// Fails: the agent does not update the simulator URL after a deploy.
it.for(trials)(
	"updates previews for production after a deploy",
	async (_, { agent, expect, repo, token, host }) => {
		await addPreview("http://localhost:3000/api/preview", "Development", { repo, token, host });

		const result = await agent(
			`We just deployed the site to https://example.com. Set up content previews for production.`,
		);

		expect(result).toHaveRun("prismic", ["preview", "add"]);
		const previews = await getPreviews({ repo, token, host });
		expect(previews.some((preview) => preview.url.includes("example.com"))).toBe(true);
		expect(previews.some((preview) => preview.url.includes("localhost:3000"))).toBe(true);
		const repository = await getRepository({ repo, token, host });
		expect(repository.simulatorUrl).toContain("example.com");
	},
);

it.for(trials)(
	"syncs in the right direction when the repo is newer",
	async (_, { project, agent, expect, repo, token, host }) => {
		const article = buildCustomType({
			json: { Main: { title: { type: "Text", config: { label: "Title" } } } },
		});
		await writeLocalCustomType(project, article);
		const subtitle = { type: "Text", config: { label: "Subtitle" } };
		const remoteArticle = {
			...article,
			json: { Main: { ...article.json.Main, subtitle } },
		};
		await insertCustomType(remoteArticle, { repo, token, host });

		const result = await agent(
			`The models in this Prismic repo were updated by a teammate. Bring this project up to date.`,
		);

		expect(result).toHaveRun("prismic", ["pull"]);
		expect(result).not.toHaveRun("prismic", ["push"]);
		const local = await readLocalCustomType(project, article.id);
		expect(local.json.Main.subtitle).toEqual(subtitle);
		const remoteTypes = await getCustomTypes({ repo, token, host });
		const remote = remoteTypes.find((type) => type.id === article.id);
		expect(remote?.json.Main.subtitle).toEqual(subtitle);
	},
);

// Fails: the agent stops at `prismic status` and never commits or pushes.
it.for(trials)(
	"commits and pushes local model changes",
	async (_, { project, agent, exec, expect, repo, token, host, home }) => {
		await writeFile(new URL(".gitignore", project), "node_modules\npackage-lock.json\n");
		await writeFile(
			new URL(".gitconfig", home),
			"[user]\n\temail = eval@example.com\n\tname = Eval\n",
		);
		await exec("git", ["init"]);
		await exec("git", ["add", "-A"]);
		await exec("git", ["commit", "-m", "Initial commit"]);
		const article = buildCustomType({ id: "article", label: "Article" });
		await writeLocalCustomType(project, article);

		const result = await agent(
			`I finished modeling the "article" type. Publish it so editors can start using it.`,
		);

		expect(result).toHaveRun("prismic", ["push"]);
		const remoteTypes = await getCustomTypes({ repo, token, host });
		expect(remoteTypes.some((type) => type.id === article.id)).toBe(true);
		const status = await exec("git", ["status", "--porcelain", "customtypes"]);
		expect(status.stdout.trim()).toBe("");
	},
);

it.for(trials)(
	"creates an API token and makes the API private",
	async (_, { agent, expect, repo, token, host }) => {
		const result = await agent(
			`Create a content API token named "ci" for this repo and make the content API private.`,
		);

		expect(result).toHaveRun("prismic", ["token", "create"]);
		expect(result).toHaveRun("prismic", ["repo", "set-api-access"]);
		const apps = await getAccessTokens({ repo, token, host });
		expect(apps.some((app) => app.name === "ci")).toBe(true);
	},
);

it.for(trials)("registers a webhook", async (_, { agent, expect, repo, token, host }) => {
	const result = await agent(
		`Register a webhook at https://example.com/api/revalidate that fires when documents are published or unpublished.`,
	);

	expect(result).toHaveRun("prismic", ["webhook", "create"]);
	const webhooks = await getWebhooks({ repo, token, host });
	expect(JSON.stringify(webhooks)).toContain("example.com/api/revalidate");
});

it.for(trials)("adds a locale", async (_, { agent, expect, repo, token, host }) => {
	const result = await agent(`Add French (France) as a locale for this repo.`);

	expect(result).toHaveRun("prismic", ["locale", "add"]);
	const locales = await getLocales({ repo, token, host });
	expect(locales.some((locale) => locale.id === "fr-fr")).toBe(true);
});

it.for(trials)(
	"does not try to reassign a document to another type",
	async (_, { project, agent, expect }) => {
		const article = buildCustomType({ id: "article", label: "Article" });
		const post = buildCustomType({ id: "blog_post", label: "Blog Post" });
		await writeLocalCustomType(project, article);
		await writeLocalCustomType(project, post);

		const result = await agent(
			`Change the "getting-started" document from the "article" type to "blog_post".`,
		);

		expect(result).not.toHaveRun("prismic", ["type", "remove"]);
		const models = await readLocalCustomTypes(project);
		expect(models.find((model) => model.id === article.id)).toEqual(article);
		expect(models.find((model) => model.id === post.id)).toEqual(post);
	},
);

it.for(trials)(
	"does not destructively act on an ambiguous request",
	async (_, { project, agent, expect }) => {
		const article = buildCustomType({
			id: "article",
			label: "Article",
			json: {
				Main: {
					title: { type: "StructuredText", config: { label: "Title", single: "heading1" } },
					body: { type: "StructuredText", config: { label: "Body", multi: "paragraph" } },
				},
			},
		});
		await writeLocalCustomType(project, article);

		const result = await agent(`Clean up the fields on "article".`);

		expect(result).not.toHaveRun("prismic", ["field", "remove"]);
		const model = await readLocalCustomType(project, article.id);
		expect(model.json.Main.title).toEqual(article.json.Main.title);
		expect(model.json.Main.body).toEqual(article.json.Main.body);
	},
);

it.for(trials)(
	"models and wires a landing page end to end",
	async (_, { project, agent, expect }) => {
		const result = await agent(
			`Build a Prismic landing page for this project: a "landing_page" type with a hero slice (heading, description, image, CTA), wired up so the page renders its slices.`,
		);

		expect(result).toHaveRun("prismic", ["type", "create"]);
		expect(result).toHaveRun("prismic", ["slice", "create"]);
		expect(result).toHaveRun("prismic", ["slice", "connect"]);
		const models = await readLocalCustomTypes(project);
		const landingPage = models.find((model) => model.id === "landing_page");
		expect(landingPage).toBeTruthy();
		const slices = await readLocalSlices(project);
		expect(slices.length).toBeGreaterThan(0);

		const sliceZone = Object.values(landingPage!.json.Main).find(
			(field) => field.type === "Slices",
		);
		const choices = (sliceZone?.config as { choices?: Record<string, unknown> })?.choices ?? {};
		expect(slices.some((slice) => slice.id in choices)).toBe(true);
	},
);
