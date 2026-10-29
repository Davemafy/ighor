import type { Event } from "./contracts";

/** Legacy clients retain data-only frames; durable clients opt into event IDs. */
export function turnEventFrame(event: Event, sequence?: number): string {
  return `${sequence === undefined ? "" : `id: ${sequence}\n`}data: ${JSON.stringify(event)}\n\n`;
}
