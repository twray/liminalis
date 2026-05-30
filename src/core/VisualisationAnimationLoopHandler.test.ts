import { beforeEach, describe, expect, it, vi } from "vitest";
import { logMessage } from "../util/log";

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

vi.mock("../util/log", () => {
  return {
    logMessage: vi.fn(),
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

const getWindowKeyboardListener = (eventType: "keydown" | "keyup") => {
  const addEventListener = (globalThis as any).window.addEventListener;
  const call = addEventListener.mock.calls.find(
    ([registeredEventType]: [string, (...args: any[]) => void]) =>
      registeredEventType === eventType,
  );

  expect(call).toBeDefined();

  return call[1] as (event: KeyboardEvent) => void;
};

const createKeyboardEvent = (
  overrides: Partial<KeyboardEvent> & { key: string; code: string },
) =>
  ({
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  }) as unknown as KeyboardEvent;

describe("VisualisationAnimationLoopHandler note dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.latestRenderCallback = null;
    mockState.midiListeners.noteon = [];
    mockState.midiListeners.noteoff = [];
    setupDomGlobals();
    vi.mocked(logMessage).mockReset();
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

  it("preserves keyboard debug events when no modifiers are pressed", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const onNoteDown = vi.fn();
    const onNoteUp = vi.fn();

    const handler = new VisualisationAnimationLoopHandler().setup(
      ({ onNoteDown: registerOnNoteDown, onNoteUp: registerOnNoteUp }) => {
        registerOnNoteDown(onNoteDown);
        registerOnNoteUp(onNoteUp);
      },
    );

    handler.render();
    await flushPromises();

    const keydownListener = getWindowKeyboardListener("keydown");
    const keyupListener = getWindowKeyboardListener("keyup");

    const keydownEvent = createKeyboardEvent({ key: "z", code: "KeyZ" });
    keydownListener(keydownEvent);

    expect(onNoteDown).toHaveBeenCalledTimes(1);
    expect(keydownEvent.preventDefault).toHaveBeenCalledTimes(1);

    const keyupEvent = createKeyboardEvent({ key: "z", code: "KeyZ" });
    keyupListener(keyupEvent);

    expect(onNoteUp).toHaveBeenCalledTimes(1);
  });

  it("does not invoke keyboard debug note events when modifier keys are pressed", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const onNoteDown = vi.fn();
    const onNoteUp = vi.fn();

    const handler = new VisualisationAnimationLoopHandler().setup(
      ({ onNoteDown: registerOnNoteDown, onNoteUp: registerOnNoteUp }) => {
        registerOnNoteDown(onNoteDown);
        registerOnNoteUp(onNoteUp);
      },
    );

    handler.render();
    await flushPromises();

    const keydownListener = getWindowKeyboardListener("keydown");
    const keyupListener = getWindowKeyboardListener("keyup");

    const ctrlKeydownEvent = createKeyboardEvent({
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
    });

    const shiftKeydownEvent = createKeyboardEvent({
      key: "Z",
      code: "KeyZ",
      shiftKey: true,
    });

    const ctrlKeyupEvent = createKeyboardEvent({
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
    });

    keydownListener(ctrlKeydownEvent);
    keydownListener(shiftKeydownEvent);
    keyupListener(ctrlKeyupEvent);

    expect(onNoteDown).not.toHaveBeenCalled();
    expect(onNoteUp).not.toHaveBeenCalled();
    expect(ctrlKeydownEvent.preventDefault).not.toHaveBeenCalled();
    expect(shiftKeydownEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("logs screenshot export on Cmd/Ctrl+S and skips debug note dispatch", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const onNoteDown = vi.fn();

    const handler = new VisualisationAnimationLoopHandler().setup(
      ({ onNoteDown: registerOnNoteDown }) => {
        registerOnNoteDown(onNoteDown);
      },
    );

    handler.render();
    await flushPromises();

    const keydownListener = getWindowKeyboardListener("keydown");

    const ctrlS = createKeyboardEvent({
      key: "s",
      code: "KeyS",
      ctrlKey: true,
    });

    const cmdS = createKeyboardEvent({
      key: "s",
      code: "KeyS",
      metaKey: true,
    });

    keydownListener(ctrlS);
    keydownListener(cmdS);

    expect(vi.mocked(logMessage)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(logMessage)).toHaveBeenNthCalledWith(
      1,
      "Snapshot exported as image",
    );
    expect(vi.mocked(logMessage)).toHaveBeenNthCalledWith(
      2,
      "Snapshot exported as image",
    );
    expect(onNoteDown).not.toHaveBeenCalled();
    expect(ctrlS.preventDefault).not.toHaveBeenCalled();
    expect(cmdS.preventDefault).not.toHaveBeenCalled();
  });
});
