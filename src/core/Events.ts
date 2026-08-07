/**
 * Minimal typed event bus. Systems talk through this instead of holding
 * references to each other, so actors / UI / world can be wired up in any order.
 *
 * Event names live in `GameEvents` below; add to that map to add an event.
 */

export interface GameEvents {
  /** An actor was clicked in the 3D view. */
  "actor:clicked": { actorId: string };
  /** A piece of furniture was clicked in the 3D view. */
  "furniture:clicked": { furnitureId: string };
  /** Nothing interactive was under the cursor. */
  "world:clicked": Record<string, never>;
  /** Game clock crossed into a new hour of the in-game day. */
  "clock:hour": { hour: number; day: number };
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    const erased = handler as (payload: unknown) => void;
    set.add(erased);
    return () => set.delete(erased);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) handler(payload);
  }
}

/** Single shared bus for the running game. */
export const events = new EventBus();
