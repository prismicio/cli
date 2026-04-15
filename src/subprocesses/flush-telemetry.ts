export {};

const SEGMENT_WRITE_KEY =
	process.env.PRISMIC_ENV && process.env.PRISMIC_ENV !== "production"
		? "Ng5oKJHCGpSWplZ9ymB7Pu7rm0sTDeiG"
		: "cGjidifKefYb6EPaGaqpt8rQXkv5TD6P";

const TRACK_URL = "https://api.segment.io/v1/track";
const IDENTIFY_URL = "https://api.segment.io/v1/identify";

const { trackEvents, identifyEvents } = JSON.parse(
	Buffer.from(process.argv[2], "base64").toString(),
);

const headers = {
	"Content-Type": "application/json",
	Authorization: `Basic ${btoa(SEGMENT_WRITE_KEY + ":")}`,
};

await Promise.allSettled([
	...trackEvents.map((e: unknown) =>
		fetch(TRACK_URL, { method: "POST", headers, body: JSON.stringify(e) }).catch(() => {}),
	),
	...identifyEvents.map((e: unknown) =>
		fetch(IDENTIFY_URL, { method: "POST", headers, body: JSON.stringify(e) }).catch(() => {}),
	),
]);
