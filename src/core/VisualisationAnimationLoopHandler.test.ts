import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = {
  latestRenderCallback: null as ((props: any) => void) | null,
  midiListeners: {
    noteon: [] as Array<(event: any) => void>,
    noteoff: [] as Array<(event: any) => void>,
  },
};

vi.mock("canvas-sketch", () => {
  return {
    default: vi.fn((sketchFactory: () => (props: any) => void) => {
      mockState.latestRenderCallback = sketchFactory();
    }),
  };
});

vi.mock("webmidi", () => {
  const input = {
    id: "mock-input-id",
    name: "Mock Input",
    addListener: vi.fn(
      (eventType: "noteon" | "noteoff", callback: (event: any) => void) => {
        mockState.midiListeners[eventType].push(callback);
      },
    ),
  };

  return {
    Utilities: {
      buildNote: vi.fn(() => ({ number: 60 })),
    },
    WebMidi: {
      inputs: [input],
      enable: vi.fn(() => Promise.resolve()),
      getInputById: vi.fn(() => input),
    },
  };
});

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const setupDomGlobals = () => {
  (globalThis as any).document = {
    createElement: vi.fn(() => ({
      setAttribute: vi.fn(),
    })),
  };

  (globalThis as any).window = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: vi.fn(),
  };

  (globalThis as any).performance = {
    now: vi.fn(() => 0),
  };
};

const createCanvasProps = () => ({
  context: {
    fillStyle: "white",
    fillRect: vi.fn(),
  },
  width: 1280,
  height: 720,
});

describe("VisualisationAnimationLoopHandler note dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.latestRenderCallback = null;
    mockState.midiListeners.noteon = [];
    mockState.midiListeners.noteoff = [];
    setupDomGlobals();
  });

  it("dispatches note callbacks immediately in MIDI arrival order", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const receivedEvents: string[] = [];

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({ computerKeyboardDebugEnabled: false, fps: 5 })
      .setup(({ onNoteDown, onNoteUp }) => {
        onNoteDown(({ note }) => {
          receivedEvents.push(`down:${note}`);
        });

        onNoteUp(({ note }) => {
          receivedEvents.push(`up:${note}`);
        });
      });

    handler.render();
    await flushPromises();

    const [noteOn] = mockState.midiListeners.noteon;
    const [noteOff] = mockState.midiListeners.noteoff;

    expect(noteOn).toBeDefined();
    expect(noteOff).toBeDefined();

    noteOn!({ note: { identifier: "C4", number: 60, attack: 0.7 } });
    noteOff!({ note: { identifier: "C4", number: 60 } });
    noteOn!({ note: { identifier: "D4", number: 62, attack: 0.9 } });

    expect(receivedEvents).toEqual(["down:C4", "up:C4", "down:D4"]);
  });

  it("does not replay note callbacks during frame rendering", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const onNoteDown = vi.fn();
    const onNoteUp = vi.fn();

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({ computerKeyboardDebugEnabled: false, fps: 5 })
      .setup(({ onNoteDown: registerNoteDown, onNoteUp: registerNoteUp }) => {
        registerNoteDown(onNoteDown);
        registerNoteUp(onNoteUp);
      });

    handler.render();
    await flushPromises();

    const [noteOn] = mockState.midiListeners.noteon;
    const [noteOff] = mockState.midiListeners.noteoff;

    noteOn!({ note: { identifier: "C4", number: 60, attack: 0.7 } });
    noteOff!({ note: { identifier: "C4", number: 60 } });

    expect(onNoteDown).toHaveBeenCalledTimes(1);
    expect(onNoteUp).toHaveBeenCalledTimes(1);

    expect(mockState.latestRenderCallback).not.toBeNull();
    mockState.latestRenderCallback!(createCanvasProps());

    expect(onNoteDown).toHaveBeenCalledTimes(1);
    expect(onNoteUp).toHaveBeenCalledTimes(1);
  });
});
