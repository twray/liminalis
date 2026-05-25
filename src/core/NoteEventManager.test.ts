import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NoteEventManager from "./NoteEventManager";

const advanceTimeBy = (ms: number) => {
  vi.setSystemTime(Date.now() + ms);
};

const registerRapidBurst = (manager: NoteEventManager) => {
  manager.registerNoteOnEvent("C4", 60);
  manager.registerNoteOffEvent("C4", 60);
  manager.registerNoteOnEvent("D4", 62);
};

describe("NoteEventManager rapid event capture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("captures rapid note events at 60fps frame polling", () => {
    const manager = new NoteEventManager();

    const initialFrameEvents = manager.getNewNoteEventsForFrame(0);
    expect(initialFrameEvents).toHaveLength(0);

    // Rapid burst occurs in the same millisecond as the previous frame poll.
    registerRapidBurst(manager);

    advanceTimeBy(16);

    const noteUpEvents = manager.getNewNoteEventsForFrame(1, "noteup");
    const noteDownEvents = manager.getNewNoteEventsForFrame(1, "notedown");

    expect(noteDownEvents).toHaveLength(2);
    expect(noteUpEvents).toHaveLength(1);

    expect(noteDownEvents.map((event) => event.note)).toEqual(["C4", "D4"]);
    expect(noteUpEvents.map((event) => event.note)).toEqual(["C4"]);
  });

  it("captures rapid note events at low 5fps frame polling", () => {
    const manager = new NoteEventManager();

    const initialFrameEvents = manager.getNewNoteEventsForFrame(0);
    expect(initialFrameEvents).toHaveLength(0);

    // Burst 1: same ms as the most recent frame poll.
    registerRapidBurst(manager);

    // Burst 2: another rapid burst shortly after, still before next frame.
    advanceTimeBy(50);
    manager.registerNoteOffEvent("D4", 62);
    manager.registerNoteOnEvent("E4", 64);
    manager.registerNoteOffEvent("E4", 64);

    // Next frame at 5fps (~200ms/frame)
    advanceTimeBy(150);

    const noteUpEvents = manager.getNewNoteEventsForFrame(1, "noteup");
    const noteDownEvents = manager.getNewNoteEventsForFrame(1, "notedown");

    expect(noteDownEvents).toHaveLength(3);
    expect(noteUpEvents).toHaveLength(3);

    expect(noteDownEvents.map((event) => event.note)).toEqual([
      "C4",
      "D4",
      "E4",
    ]);
    expect(noteUpEvents.map((event) => event.note)).toEqual(["C4", "D4", "E4"]);
  });

  it("returns a stable event set for repeated filtered calls within the same frame", () => {
    const manager = new NoteEventManager();

    manager.getNewNoteEventsForFrame(0);

    manager.registerNoteOnEvent("F4", 65);
    manager.registerNoteOffEvent("F4", 65);

    advanceTimeBy(16);

    const noteUpEventsFirstCall = manager.getNewNoteEventsForFrame(1, "noteup");
    const noteDownEventsSecondCall = manager.getNewNoteEventsForFrame(
      1,
      "notedown",
    );
    const allEventsThirdCall = manager.getNewNoteEventsForFrame(1);

    expect(noteUpEventsFirstCall).toHaveLength(1);
    expect(noteDownEventsSecondCall).toHaveLength(1);
    expect(allEventsThirdCall).toHaveLength(2);
  });

  it("preserves chronological rapid down/up/down order at 60fps polling", () => {
    const manager = new NoteEventManager();

    manager.getNewNoteEventsForFrame(0);

    manager.registerNoteOnEvent("C4", 60);
    manager.registerNoteOffEvent("C4", 60);
    manager.registerNoteOnEvent("C4", 60);

    advanceTimeBy(16);

    const events = manager.getNewNoteEventsForFrame(1);

    expect(events.map((event) => `${event.event}:${event.note}`)).toEqual([
      "notedown:C4",
      "noteup:C4",
      "notedown:C4",
    ]);
  });

  it("preserves chronological rapid event order at low 5fps polling", () => {
    const manager = new NoteEventManager();

    manager.getNewNoteEventsForFrame(0);

    manager.registerNoteOnEvent("C4", 60);
    manager.registerNoteOffEvent("C4", 60);

    advanceTimeBy(50);

    manager.registerNoteOnEvent("D4", 62);
    manager.registerNoteOffEvent("D4", 62);
    manager.registerNoteOnEvent("E4", 64);

    // Next frame at 5fps (~200ms/frame)
    advanceTimeBy(150);

    const events = manager.getNewNoteEventsForFrame(1);

    expect(events.map((event) => `${event.event}:${event.note}`)).toEqual([
      "notedown:C4",
      "noteup:C4",
      "notedown:D4",
      "noteup:D4",
      "notedown:E4",
    ]);
  });
});
