import { sendSegmentEvents } from "../lib/segment";

const { trackEvents, identifyEvents } = JSON.parse(
	Buffer.from(process.argv[2], "base64").toString(),
);

try {
	await sendSegmentEvents(trackEvents, identifyEvents);
} catch {}
