import { sendSegmentEvents } from "../lib/segment";

const { trackEvents, identifyEvents, writeKey } = JSON.parse(
	Buffer.from(process.argv[2], "base64").toString(),
);

try {
	await sendSegmentEvents(trackEvents, identifyEvents, writeKey);
} catch {}
