export {};

const TRACK_URL = "https://api.segment.io/v1/track";
const IDENTIFY_URL = "https://api.segment.io/v1/identify";

const { authorization, trackEvents, identifyEvents } = JSON.parse(
	Buffer.from(process.argv[2], "base64").toString(),
);

const headers = { "Content-Type": "application/json", Authorization: authorization };

await Promise.allSettled([
	...trackEvents.map((e: unknown) =>
		fetch(TRACK_URL, { method: "POST", headers, body: JSON.stringify(e) }).catch(() => {}),
	),
	...identifyEvents.map((e: unknown) =>
		fetch(IDENTIFY_URL, { method: "POST", headers, body: JSON.stringify(e) }).catch(() => {}),
	),
]);
