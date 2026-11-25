import { EventEmitter } from "node:events";

/** In-process fan-out. Lives on globalThis because Next bundles routes separately. */
const g = globalThis as unknown as { __mohurBus?: EventEmitter };
function emitter() {
  if (!g.__mohurBus) { g.__mohurBus = new EventEmitter(); g.__mohurBus.setMaxListeners(0); }
  return g.__mohurBus;
}
export const publish = (topic: string) => void emitter().emit(topic);
export function subscribe(topic: string, fn: () => void) {
  emitter().on(topic, fn);
  return () => void emitter().off(topic, fn);
}
export const topics = { payment: (id: string) => `p:${id}`, merchant: (id: string) => `m:${id}`, wake: "wake" };
