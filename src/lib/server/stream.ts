import { subscribe } from "./bus";

/** Server-sent events: pushes `snapshot()` now and whenever the topic fires. */
export function sse(req: Request, topic: string, snapshot: () => unknown) {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(ctl) {
      let last = "";
      const send = () => {
        try {
          const data = JSON.stringify(snapshot());
          if (data === last) return;
          last = data;
          ctl.enqueue(enc.encode(`data: ${data}\n\n`));
        } catch { cleanup(); }
      };
      const off = subscribe(topic, send);
      const beat = setInterval(() => { try { ctl.enqueue(enc.encode(": \n\n")); } catch { cleanup(); } }, 20_000);
      // EventSource reconnects by itself; this bounds how long a stale tab can hold a socket.
      const end = setTimeout(() => cleanup(), 15 * 60_000);
      cleanup = () => { off(); clearInterval(beat); clearTimeout(end); cleanup = () => {}; try { ctl.close(); } catch { /* already closed */ } };
      req.signal.addEventListener("abort", () => cleanup());
      ctl.enqueue(enc.encode("retry: 2000\n\n"));
      send();
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
