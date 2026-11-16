// Load into the CLI with `node --import`. Instead of sending Segment events, it
// appends them as one JSON line per run to the SEGMENT_EVENTS_FILE path.
import childProcess from "node:child_process";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const spawn = childProcess.spawn;

childProcess.spawn = ((command: string, args: string[], options: object) => {
	if (!args[0]?.endsWith("sendSegmentEvents.mjs")) return spawn(command, args, options);
	const { trackEvents } = JSON.parse(Buffer.from(args[1], "base64").toString());
	appendFileSync(process.env.SEGMENT_EVENTS_FILE!, JSON.stringify(trackEvents) + "\n");
	return { unref() {} };
}) as typeof spawn;
syncBuiltinESMExports();
