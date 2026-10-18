import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDeletion, type DeleteClient, type DeleteEvent } from "./deleter";
import { openStore } from "./store";

const tweet = (id: string) => ({ id, ts: 0, text: id, media: [] });

function setup(ids: string[], rts: string[] = []) {
	const store = openStore(fs.mkdtempSync(path.join(os.tmpdir(), "deleter-test-")));
	fs.writeFileSync(store.TWEETS, JSON.stringify({ tweets: ids.map(tweet), replies: [], retweets: rts.map(tweet) }));
	store.writeIds("selected.json", [...ids, ...rts]);
	return store;
}

// Fake X: records calls and how many deletes were in flight at once.
function fakeClient(handle: (id: string, call: number) => unknown = () => ({})) {
	let inFlight = 0, calls = 0;
	const c = {
		maxInFlight: 0,
		deletedIds: [] as string[],
		login: async () => {},
		tweets: {
			async delete(id: string) {
				inFlight++;
				c.maxInFlight = Math.max(c.maxInFlight, inFlight);
				await new Promise((r) => setTimeout(r, 5));
				inFlight--;
				const res = handle(id, ++calls);
				c.deletedIds.push(id);
				return res;
			},
			get: async () => ({}),
			unretweet: async () => ({}),
		},
	} satisfies DeleteClient & Record<string, unknown>;
	return c as typeof c & DeleteClient;
}

describe("runDeletion", () => {
	test("deletes everything ticked, several at a time, and saves progress", async () => {
		const ids = Array.from({ length: 12 }, (_, i) => String(i));
		const store = setup(ids);
		const client = fakeClient();
		const events: DeleteEvent[] = [];
		const res = await runDeletion({ store, token: "x", client, workers: 3, delayMs: 0, onEvent: (e) => events.push(e) });

		expect(res).toEqual({ ok: 12, fail: 0 });
		expect(client.maxInFlight).toBe(3);
		expect(new Set(store.readIds("deleted.json"))).toEqual(new Set(ids));
		expect(store.readIds("selected.json")).toEqual([]);
		// n counts up 1..12 even though deletes finish out of order
		expect(events.filter((e) => e.type === "ok").map((e) => (e as { n: number }).n)).toEqual(ids.map((_, i) => i + 1));
	});

	test("a rate limit pauses and the tweet is retried", async () => {
		const store = setup(["a", "b"]);
		const client = fakeClient((_, call) => {
			if (call === 1) throw Object.assign(new Error("Rate limit exceeded"), { status: 429 });
			return {};
		});
		// report a reset 1s from now so the wait is short
		const events: DeleteEvent[] = [];
		const realDelete = client.tweets.delete;
		client.tweets.delete = async (id: string) => {
			client.onResponse?.({ name: "DeleteTweet", status: 200, headers: { "x-rate-limit-reset": String(Math.ceil(Date.now() / 1000)) } });
			return realDelete(id);
		};
		const res = await runDeletion({ store, token: "x", client, workers: 1, delayMs: 0, onEvent: (e) => events.push(e) });

		expect(res).toEqual({ ok: 2, fail: 0 });
		expect(events.some((e) => e.type === "wait")).toBe(true);
		expect(store.readIds("selected.json")).toEqual([]);
	});

	test("stopping keeps what was deleted and leaves the rest ticked", async () => {
		const ids = Array.from({ length: 10 }, (_, i) => String(i));
		const store = setup(ids);
		let stop = false;
		const client = fakeClient((_, call) => { if (call >= 4) stop = true; return {}; });
		const res = await runDeletion({ store, token: "x", client, workers: 2, delayMs: 0, shouldStop: () => stop });

		const deleted = store.readIds("deleted.json");
		expect(deleted.length).toBe(res.ok);
		expect(res.ok).toBeLessThan(10);
		expect(store.readIds("selected.json").sort()).toEqual(ids.filter((id) => !deleted.includes(id)).sort());
	});

	test("an error X reports alongside data still counts as a failure", async () => {
		const store = setup(["a"]);
		const client = fakeClient(() => ({ data: {}, errors: [{ message: "nope" }] }));
		const res = await runDeletion({ store, token: "x", client, workers: 1, delayMs: 0 });
		expect(res).toEqual({ ok: 0, fail: 1 });
		expect(store.readIds("selected.json")).toEqual(["a"]);
	}, 20_000);
});
