# Liminalis

A creative coding framework for building real-time music visualizations in TypeScript. Liminalis provides first-class support for MIDI events, animatable objects with lifecycle hooks, and a powerful timeline animation system—all designed to create responsive, interactive visual experiences.

## Features

- 🎹 **Native MIDI Support**: Built-in `onNoteDown` and `onNoteUp` event handlers for seamless MIDI integration
- 🧭 **Dual Scene Registration API**: Choose keyed (`addWithKey`) or instance-based (`add`) workflows
- 🎨 **Lifecycle-Driven Animations**: Objects respond to attack, sustain, and release phases with automatic state management
- ⏱️ **Timeline Animation System**: Create smooth, overlapping animations with function or string-based easing
- 🖼️ **Unified Rendering API**: Compose 2D canvas primitives and isometric views in the same render operation
- ✏️ **Expanded 2D Primitives**: `line`, `polygon`, `bezier`, `arc`, `ellipse`, `rect`, `circle`, and `text`
- 🌈 **Blend Mode Styling**: Apply compositing via per-shape `blend` or scoped `withStyles({ blend })`
- 🎲 **Isometric Rendering**: Built-in isometric projection with cuboids and tiles

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
  - [MIDI Event Handling](#midi-event-handling)
  - [Animatable Objects & Lifecycle](#animatable-objects--lifecycle)
  - [Rendering Strategies](#rendering-strategies)
  - [Shape Animations with .animateTo()](#shape-animations-with-animateto)
- [Examples](#examples)
- [API Reference](#api-reference)
- [Development](#development)

## Quick Start

The fastest way to get started with Liminalis is using the CLI scaffolding tool:

```bash
npm create liminalis-app my-music-viz
cd my-music-viz
npm install
npm run dev
```

This creates a new project with:

- ✅ TypeScript support out of the box
- ✅ Vite for instant hot module reloading
- ✅ MIDI device integration pre-configured
- ✅ Example visualizations to get started
- ✅ Production build setup

**Choose from templates:**

Your browser will open at `http://localhost:3000` with your visualization running. Press keys `1-9` to test without MIDI hardware, or connect a MIDI controller to see real-time reactions!

## Installation

For adding Liminalis to an existing project:

```bash
npm install liminalis
```

Or with yarn:

```bash
yarn add liminalis
```

Or with pnpm:

```bash
pnpm add liminalis
```

### Manual Setup

Create your first MIDI-driven visualization:

```typescript
import { createScene, visual } from "liminalis";

createScene
  .setup(({ atStart, onNoteDown, onNoteUp }) => {
    // Create a circle that responds to MIDI
    atStart(({ scene }) => {
      scene.addPermanentlyWithKey(
        "circle",
        visual(({ draw, timeAttacked, timeReleased }) => {
          draw(({ circle, center }) => {
            circle({
              cx: center.x,
              cy: center.y,
              radius: 50,
              strokeStyle: "#666",
            })
              .animateTo(
                { radius: 150 },
                { at: timeAttacked, duration: 1000, easing: "easeOutBounce" },
              )
              .animateTo({ radius: 50 }, { at: timeReleased, duration: 1000 });
          });
        })(),
      );
    });

    // Trigger attack on MIDI note press
    onNoteDown(({ scene }) => {
      scene.getByKey("circle")?.attack(1);
    });

    // Trigger release on MIDI note release
    onNoteUp(({ scene }) => {
      scene.getByKey("circle")?.release();
    });
  })
  .render();
```

### Running with Vite (Recommended)

The easiest way is using `create-liminalis-app` which sets up Vite automatically. For manual setup:

1. **Install Vite**:

```bash
npm install --save-dev vite
```

2. **Create `vite.config.ts`**:

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
    open: true,
  },
});
```

3. **Add to `package.json`**:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

4. **Create `index.html`**:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Liminalis App</title>
  </head>
  <body>
    <canvas id="canvas-visualisation"></canvas>
    <script type="module" src="/src/index.ts"></script>
  </body>
</html>
```

5. **Run**:

```bash
npm run dev
```

### Native Runtime Note

Liminalis now runs with its own native in-framework canvas renderer and no
longer requires `canvas-sketch`.

### TypeScript Configuration

Create a `tsconfig.json` for your project:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ES2020",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Core Concepts

### MIDI Event Handling

Liminalis provides native MIDI event handlers that make it trivial to respond to musical input. The framework automatically manages MIDI connections via WebMIDI and provides clean callback interfaces.

#### `onNoteDown` - Triggered when a MIDI note is pressed

```typescript
createScene
  .setup(({ onNoteDown }) => {
    onNoteDown(({ note, attack, scene }) => {
      // 'note' is the MIDI note name (e.g., "C4", "A#3")
      // 'attack' is normalized velocity (0.0 to 1.0)

      console.log(`Note: ${note}, Velocity: ${attack}`);
    });
  })
  .render();
```

#### `onNoteUp` - Triggered when a MIDI note is released

```typescript
createScene
  .setup(({ onNoteUp }) => {
    onNoteUp(({ note, scene }) => {
      // Handle note release
      scene.getByKey(note)?.release();
    });
  })
  .render();
```

#### Example: Piano Keyboard Visualization

```typescript
createScene
  .setup(({ atStart, onNoteDown, onNoteUp }) => {
    const notes = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"];

    atStart(({ scene }) => {
      // Create a piano key for each note
      notes.forEach((note, index) => {
        scene.addPermanentlyWithKey(note, pianoKey({ x: index * 60, y: 100 }));
      });
    });

    onNoteDown(({ scene, note, attack }) => {
      // Trigger attack animation on the corresponding key
      scene.getByKey(note)?.attack(attack);
    });

    onNoteUp(({ scene, note }) => {
      // Trigger release animation
      scene.getByKey(note)?.release();
    });
  })
  .render();
```

### Animatable Objects & Lifecycle

The heart of Liminalis is the **animatable object system**. Objects can respond to MIDI lifecycle events (attack, sustain, release) with automatic state tracking and timing.

#### Creating MIDI Visuals

```typescript
import { visual } from "liminalis";
import { easeOutBounce } from "easing-utils";

const springCircle = () => {
  return visual<{ xOffset: number }>(
    ({
      props,
      draw,
      attackValue,
      releaseFactor,
      timeAttacked,
      timeReleased,
    }) => {
      draw(({ circle, center }) => {
        const { xOffset = 0 } = props;
        const { x: cx, y: cy } = center;

        circle({
          cx: cx + xOffset,
          cy,
          radius: 0,
          strokeStyle: "#666",
          opacity: releaseFactor, // Fade during release
        })
          .animateTo(
            { radius: 100 * attackValue }, // Scale by attack velocity
            { at: timeAttacked, duration: 1000, easing: easeOutBounce },
          )
          .animateTo({ radius: 0 }, { at: timeReleased, duration: 500 });
      });
    },
  );
};
```

#### Lifecycle States

Animatable objects automatically track their lifecycle state:

- **`idle`**: Before any interaction
- **`sustained`**: After attack, before release
- **`releasing`**: During release phase
- **`released`**: After release completes

#### Lifecycle Properties

Your renderer receives these properties automatically:

- **`status`**: Current lifecycle state
- **`attackValue`**: Attack velocity (0.0 to 1.0)
- **`releaseFactor`**: Opacity multiplier during release (1.0 → 0.0)
- **`timeAttacked`**: Timestamp when attack occurred
- **`timeReleased`**: Timestamp when release occurred
- **`timeFirstRender`**: Timestamp of first render

#### Example: State-Based Rendering

```typescript
import { easeOutBack } from "easing-utils";

const pianoKey = () => {
  return visual<{ x: number; y: number }>(
    ({ props, draw, timeAttacked, timeReleased }) => {
      draw(({ rect }) => {
        const { x, y } = props;

        rect({
          x,
          y,
          width: 60,
          height: 200,
          strokeStyle: "#666",
        })
          .animateTo(
            { height: 220 },
            { at: timeAttacked, duration: 500, easing: easeOutBack },
          )
          .animateTo(
            { height: 200 },
            { at: timeReleased, duration: 500, easing: easeOutBack },
          );
      });
    },
  );
};
```

#### Managing Objects

```typescript
// Instance-based registration (non-keyed)
const permanent = springCircle({ xOffset: 50 });
scene.addPermanently(permanent);
permanent.attack(0.8);

if (scene.has(permanent)) {
  permanent.release(1000);
}

// Key-based registration
scene.addWithKey("temp-circle", springCircle({ xOffset: 100 }));
scene.getByKey("temp-circle")?.attack(0.9);
scene.getByKey("temp-circle")?.release(700);

if (scene.hasKey("temp-circle")) {
  scene.removeByKey("temp-circle");
}
```

### Rendering Strategies

Liminalis provides a unified, composable rendering API that allows you to combine 2D canvas primitives and isometric 3D projections in the same frame.

#### Composable Rendering API

Both `onRender` (for static content) and `visual(...)` renderers (for MIDI visuals) use the same composable structure:

```typescript
// Access both 2D and isometric rendering in the same callback
onRender(({ draw, renderIsometric }) => {
  // Draw 2D canvas primitives
  draw(({ circle, rect, background, withStyles }) => {
    background({ color: "#faf0e6" });

    withStyles({ strokeStyle: "#333", strokeWidth: 2 }, () => {
      circle({ cx: 400, cy: 300, radius: 50 });
      rect({ x: 100, y: 100, width: 200, height: 100 });
    });
  });

  // Render isometric 3D objects
  renderIsometric(({ cuboid, tile, withStyles }) => {
    withStyles({ fillStyle: "white", strokeWidth: 3 }, () => {
      cuboid({
        isoX: 0,
        isoY: 0,
        isoZ: 0,
        lengthX: 2,
        lengthY: 2,
        lengthZ: 1,
      });

      tile({
        isoX: 0,
        isoY: 0,
        isoZ: 2,
        width: 2,
        height: 2,
        type: "top",
      });
    });
  });
});
```

**Key Benefits:**

- ✅ **Consistent API**: Same structure for static and dynamic rendering
- ✅ **Composable**: Mix 2D and 3D in the same frame
- ✅ **Isolated contexts**: `draw()` and `renderIsometric()` don't interfere with each other
- ✅ **Type-safe**: Full TypeScript support for all primitives

#### 1. Lifecycle-Based Rendering (Dynamic Objects)

Use MIDI visuals with lifecycle callbacks for interactive elements that respond to MIDI events:

```typescript
createScene
  .setup(({ atStart, onNoteDown, onNoteUp }) => {
    atStart(({ scene }) => {
      // Add MIDI visual
      scene.addPermanentlyWithKey(
        "note",
        visual(({ draw, timeAttacked, timeReleased }) => {
          draw(({ circle, center }) => {
            circle({
              cx: center.x,
              cy: center.y,
              radius: 50,
            })
              .animateTo({ radius: 100 }, { at: timeAttacked, duration: 1000 })
              .animateTo({ radius: 50 }, { at: timeReleased, duration: 1000 });
          });
        })(),
      );
    });

    onNoteDown(({ scene }) => {
      scene.getByKey("note")?.attack(1);
    });

    onNoteUp(({ scene }) => {
      scene.getByKey("note")?.release();
    });
  })
  .render();
```

#### 2. Static Rendering (Per-Frame)

Use `onRender` with `draw()` for static elements that don't need lifecycle management:

```typescript
createScene
  .setup(({ onRender }) => {
    onRender(({ draw, time }) => {
      draw(({ background, rect, circle, withStyles }) => {
        background({ color: "#F7F2E7" });

        // Draw static UI elements
        withStyles({ strokeStyle: "#666", strokeWidth: 3 }, () => {
          rect({ x: 100, y: 100, width: 800, height: 500, cornerRadius: 30 });

          // Draw window buttons
          const buttonColors = ["#FF605C", "#FFBD44", "#00CA4E"];
          buttonColors.forEach((color, i) => {
            circle({
              cx: 50 + i * 45,
              cy: 50,
              radius: 15,
              fillStyle: color,
              strokeStyle: color,
            });
          });
        });
      });
    });
  })
  .render();
```

#### Combined Example: Piano with UI

```typescript
createScene
  .setup(({ atStart, onRender, onNoteDown, onNoteUp }) => {
    // Static UI rendered every frame
    onRender(({ draw }) => {
      draw(({ background, rect, line, withStyles }) => {
        background({ color: "#F7F2E7" });

        withStyles({ strokeStyle: "#666", strokeWidth: 3 }, () => {
          rect({ x: 100, y: 100, width: 800, height: 500, cornerRadius: 30 });
          line({ start: { x: 100, y: 170 }, end: { x: 900, y: 170 } });
        });
      });
    });

    // Dynamic piano keys respond to MIDI
    atStart(({ scene }) => {
      const notes = ["C4", "D4", "E4", "F4", "G4"];
      notes.forEach((note, i) => {
        scene.addPermanentlyWithKey(
          note,
          pianoKey({ x: 200 + i * 65, y: 250 })
        );
      });
    });

    onNoteDown(({ scene, note, attack }) => {
      scene.getByKey(note)?.attack(attack);
    });
```

#### Composing 2D and Isometric Together

You can seamlessly mix 2D UI elements with 3D isometric visualizations:

```typescript
createScene
  .setup(({ onRender, onNoteDown, onNoteUp }) => {
    onRender(({ draw, renderIsometric }) => {
      // Draw 2D background and UI
      draw(({ circle, center, background }) => {
        const { x: cx, y: cy } = center;
        background({ color: "#faf0e6" });

        // Concentric circles in 2D
        for (let i = 0; i < 10; i++) {
          circle({
            cx,
            cy,
            radius: (i + 1) * 10,
            fillStyle: "#333333",
            opacity: 1 - i / 10,
          });
        }
      });

      // Render 3D isometric objects on top
      renderIsometric(({ cuboid, tile, withStyles }) => {
        withStyles({ fillStyle: "white", strokeWidth: 3 }, () => {
          cuboid({
            isoX: 0,
            isoY: 0,
            isoZ: -0.5,
            lengthX: 1,
            lengthY: 1,
            lengthZ: 1,
          });

          tile({
            isoX: 0,
            isoY: 0,
            isoZ: 2.5,
            width: 1,
            height: 1,
            type: "side-right",
          });
        });
      });
    });

    // MIDI visuals can also compose both
    onNoteDown(({ scene, note }) => {
      scene.addWithKey(
        note,
        visual(({ draw, renderIsometric, releaseFactor }) => {
          // 2D circle
          draw(({ center, circle }) => {
            circle({
              cx: center.x,
              cy: center.y,
              radius: 200,
              opacity: releaseFactor,
            });
          });

          // 3D cuboid
          renderIsometric(({ cuboid }) => {
            cuboid({
              isoX: 0,
              isoY: 0,
              isoZ: -2.5,
              lengthX: 3,
              lengthY: 3,
              lengthZ: 3,
              strokeStyle: "white",
              fillStyle: "transparent",
            });
          });
        })().attack(1),
      );
    });

    onNoteUp(({ scene, note }) => {
      scene.getByKey(note)?.release(500);
    });
  })
  .render();
```

### Shape Animations with `.animateTo()`

Liminalis features a powerful declarative animation system for shape primitives. The `.animateTo()` method (internally powered by the `Animatable` class) creates smooth, timeline-based animations with support for:

- **Event-based timing** using `timeAttacked`, `timeReleased`, `timeFirstRender`
- **Smooth overlapping** - animations blend seamlessly when events occur rapidly
- **Sequential or parallel** - chain animations or animate multiple properties at once
- **Reusable options** - apply default timing/easing to multiple segments with `withOptions()`
- **Type-safe** - only numeric properties can be animated (enforced at compile time)

Shape primitives (`line`, `polygon`, `bezier`, `arc`, `circle`, `ellipse`, `rect`, `text`) return `AnimatableShape` instances that support declarative timeline animations using the `.animateTo()` method. This allows you to create smooth, chained animations on any numeric properties.

#### Basic Animation

```typescript
onRender(({ draw }) => {
  draw(({ rect }) => {
    // Animate from x:0 to x:100 over 1 second
    rect({
      x: 0,
      y: 50,
      width: 20,
      height: 20,
      fillStyle: "#ff0000",
    }).animateTo({ x: 100 }, { duration: 1000 });
  });
});
```

#### Sequential Animations

Chain multiple `.animateTo()` calls - each starts after the previous completes:

```typescript
rect({ x: 0, y: 50, width: 20, height: 20, fillStyle: "#00ff00" })
  .animateTo({ x: 100 }, { duration: 1000 }) // 0-1000ms: move right
  .animateTo({ y: 150 }, { duration: 500 }); // 1000-1500ms: move down
```

#### Parallel Animations

Animate multiple properties simultaneously by including them in one `.animateTo()`:

```typescript
rect({ x: 0, y: 50, width: 20, height: 20, fillStyle: "#0000ff" }).animateTo(
  { x: 100, y: 150 },
  { duration: 1000 },
); // Both x and y animate together
```

#### Explicit Timing with `at`

Use the `at` property to start animations at specific times:

```typescript
rect({ x: 0, y: 50, width: 20, height: 20, fillStyle: "#ff00ff" })
  .animateTo({ x: 100 }, { at: 500, duration: 1000 }) // Starts at 500ms
  .animateTo({ y: 150 }, { at: 1000, duration: 500 }); // Starts at 1000ms
```

#### Event-Based Timing with `at: null`

Use `null` for `at` to wait for a dynamic event time. This is the foundation for MIDI-responsive animations:

```typescript
visual(({ draw, timeAttacked, timeReleased }) => {
  draw(({ rect }) => {
    rect({ x: 0, y: 50, width: 20, height: 20, fillStyle: "#ffff00" })
      .animateTo({ x: 100 }, { at: timeAttacked, duration: 500 })
      .animateTo({ x: 0 }, { at: timeReleased, duration: 300 });
  });
});
```

When `timeAttacked` or `timeReleased` is `null`, the animation waits until the event occurs.

#### Applying Default Options with `withOptions()`

Use `.withOptions()` to apply default options to all subsequent `.animateTo()` calls. This keeps your animation code DRY:

```typescript
circle({ cx: 100, cy: 100, radius: 50 })
  .withOptions({ duration: 500, easing: easeOutBounce })
  .animateTo({ radius: 100 }) // Uses duration: 500, easing: easeOutBounce
  .animateTo({ radius: 150 }) // Uses duration: 500, easing: easeOutBounce
  .animateTo({ radius: 200 }, { duration: 1000 }); // Override: duration: 1000
```

**Key behaviors:**

- Options stack with multiple `withOptions()` calls
- Per-segment options override `withOptions()` defaults
- Chainable with both `withOptions()` and `to()`

```typescript
// Stacking options
circle({ cx: 100, cy: 100, radius: 50 })
  .withOptions({ duration: 500 })
  .withOptions({ delay: 100 }) // Now has both duration: 500 and delay: 100
  .animateTo({ radius: 100 });
```

#### Easing Functions

Add natural motion with easing:

```typescript
rect({ x: 0, y: 50, width: 20, height: 20, fillStyle: "#00ffff" }).animateTo(
  { x: 100 },
  {
    duration: 1000,
    easing: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  },
);
```

You can pass either:

- A function `(t) => number`
- A convenience string name from `easing-utils` (for example, `"easeInSine"`)

If you prefer string names (no import required):

```typescript
rect({ x: 0, y: 50, width: 20, height: 20, fillStyle: "#ff8800" }).animateTo(
  { x: 100 },
  { duration: 1000, easing: "easeOutBounce" },
);
```

Or use easing libraries directly:

```typescript
import { easeOutBounce, easeOutBack, easeInCubic } from "easing-utils";

rect({ x: 0, y: 50, width: 20, height: 20, fillStyle: "#ff8800" }).animateTo(
  { x: 100 },
  { duration: 1000, easing: easeOutBounce },
);
```

#### Reverse Animations

The `reverse` option inverts the animation direction:

```typescript
// Starts at target value and animates backward to initial
circle({ cx: 100, cy: 100, radius: 50 }).animateTo(
  { radius: 100 },
  { duration: 1000, reverse: true },
);
// At t=0: radius=100, at t=1000: radius=50
```

This is useful for "reveal" effects where you want to animate from a final state back to an initial state.

#### Overlapping Animations (Superseding)

When a new animation starts on a property that's already animating, the new segment **supersedes** the old one, capturing the current interpolated value as its starting point:

```typescript
visual(({ draw, timeAttacked, timeReleased }) => {
  draw(({ circle, center }) => {
    circle({ cx: center.x, cy: center.y, radius: 50 })
      .animateTo({ radius: 150 }, { at: timeAttacked, duration: 1000 })
      .animateTo({ radius: 50 }, { at: timeReleased, duration: 500 });
  });
});
```

**Superseding behavior:**

1. **Attack starts**: radius animates from 50 → 150 over 1000ms
2. **Quick release at 400ms** (radius is now ~90):
   - Release animation captures current value (90)
   - Animates 90 → 50 over 500ms
3. **Result**: Smooth transition without jarring jumps

This enables natural, responsive animations for rapid MIDI input.

#### Multi-Property Independence

When animations overlap, only the affected properties are superseded:

```typescript
circle({ cx: 0, cy: 0, radius: 50 })
  .animateTo({ cx: 100, cy: 100 }, { at: 0, duration: 1000 })
  .animateTo({ cx: 0 }, { at: 500, duration: 500 }); // Only supersedes cx
// cy continues its original animation unaffected
```

#### Animation Segment Options

```typescript
interface AnimationSegmentOptions {
  at?: number | null; // Start time (ms) or null for event-based
  duration?: number; // Duration in ms
  endTime?: number; // Alternative: absolute end time
  delay?: number; // Delay before starting (added to 'at')
  easing?: ((t: number) => number) | string; // Easing function or easing-utils name (e.g. "easeInSine")
  reverse?: boolean; // Reverse animation direction
}
```

#### Key Behaviors

| Behavior                        | Description                                                     |
| ------------------------------- | --------------------------------------------------------------- |
| **Sequential by default**       | Segments without `at` start after the previous completes        |
| **Event-based with `at: null`** | Segment waits until the time value becomes non-null             |
| **Overlapping supersedes**      | Later segments capture current value as their start             |
| **Property independence**       | Each property is animated independently                         |
| **Value persistence**           | Properties stay at their final values after animation completes |
| **Type-safe**                   | Only numeric properties can be animated                         |

#### ⚠️ Combining `delay` with `at`

When using `delay` in combination with `at`, the effective start time is calculated as `at + delay`. This can lead to unexpected timing if not used carefully.

**Problematic pattern:**

```typescript
circle({ cx, cy, radius: 0 })
  .animateTo({ radius: 100 }, { at: 500, delay: 500, duration: 500 })
  .animateTo({ radius: 0 }, { at: 1000, duration: 500 }); // No delay!
```

Here, the first segment has an effective start time of 1000ms (500 + 500), while the second also starts at 1000ms. Both segments start simultaneously, causing only the second to play.

**Recommended patterns:**

1. **Apply delay globally via `withOptions()`:**

```typescript
circle({ cx, cy, radius: 0 })
  .withOptions({ delay: 500, duration: 500 })
  .animateTo({ radius: 100 }, { at: 500 })
  .animateTo({ radius: 0 }, { at: 1100 });
```

2. **Explicitly set delay on all `at` segments:**

```typescript
circle({ cx, cy, radius: 0 })
  .animateTo({ radius: 100 }, { at: 500, delay: 500, duration: 500 })
  .animateTo({ radius: 0 }, { at: 1100, delay: 500, duration: 500 });
```

A console warning will appear if you mix `at` segments where some have `delay` and others don't, helping you catch potential timing issues during development.

#### Complete MIDI Animation Example

Here's a complete example showing attack/release animation with overlapping handling:

```typescript
import { easeOutBounce, easeOutCubic } from "easing-utils";

createScene
  .setup(({ atStart, onNoteDown, onNoteUp }) => {
    atStart(({ scene }) => {
      scene.addPermanentlyWithKey(
        "circle",
        visual(({ draw, timeAttacked, timeReleased, releasePeriod }) => {
          draw(({ circle, center }) => {
            circle({
              cx: center.x,
              cy: center.y,
              radius: 50,
              strokeStyle: "#666",
              strokeWidth: 2,
            })
              .withOptions({ duration: 500 })
              .animateTo(
                { radius: 150 },
                { at: timeAttacked, easing: easeOutBounce },
              )
              .animateTo(
                { radius: 50 },
                {
                  at: timeReleased,
                  easing: easeOutCubic,
                  duration: releasePeriod,
                },
              );
          });
        })(),
      );
    });

    onNoteDown(({ scene }) => {
      scene.getByKey("circle")?.attack(1);
    });

    onNoteUp(({ scene }) => {
      scene.getByKey("circle")?.release();
    });
  })
  .render();
```

## Examples

### 1. Simple Circles (`/examples/animatable-circles`)

Demonstrates both rendering strategies in one visualization:

- **Dynamic circles** that respond to MIDI attack/release
- **Static circles** animated via `onRender` with staggered delays
- **New shape primitives** (`polygon`, `bezier`, `ellipse`, `arc`) layered with blend modes
- **Text rendering** via `text()` for labels/instructions

```typescript
createScene
  .setup(({ atStart, onRender, onNoteDown, onNoteUp }) => {
    const noteVisual = visual(({ draw }) => {
      draw(({ circle, center }) => {
        circle({
          cx: center.x,
          cy: center.y,
          radius: 50,
        });
      });
    });

    const persistentNoteVisual = noteVisual();

    // Dynamic MIDI-responsive circle
    atStart(({ scene }) => {
      scene.addPermanently(persistentNoteVisual);
    });

    // Static animated circles
    onRender(({ draw, center }) => {
      draw(({ circle, ellipse, arc, polygon, bezier, text }) => {
        for (let i = 0; i < 3; i++) {
          circle({
            cx: center.x + i * 40 - 40,
            cy: center.y - 200,
            radius: 10,
          }).animateTo(
            { cy: center.y - 100 },
            { duration: 1000, delay: 500 + i * 250 },
          );
        }

        ellipse({
          cx: center.x,
          cy: center.y + 120,
          radiusX: 150,
          radiusY: 45,
          blend: "multiply",
        });

        arc({
          cx: center.x,
          cy: center.y + 120,
          radius: 90,
          start: 200,
          end: 340,
          strokeWidth: 8,
          blend: "screen",
        });

        polygon({
          points: [
            { x: center.x - 70, y: center.y + 80 },
            { x: center.x, y: center.y + 40 },
            { x: center.x + 70, y: center.y + 80 },
          ],
          closePath: true,
          blend: "overlay",
        });

        bezier({
          segments: [
            { point: { x: center.x - 100, y: center.y + 140 } },
            {
              control: { x: center.x - 20, y: center.y + 90 },
              point: { x: center.x + 20, y: center.y + 140 },
            },
          ],
          fillStyle: "transparent",
          blend: "difference",
        });

        text("Use keys 1-9 or MIDI input", {
          x: center.x - 130,
          y: center.y + 175,
          fontStyle: "16px serif",
        });
      });
    });

    onNoteDown(({ scene }) => {
      if (scene.has(persistentNoteVisual)) {
        persistentNoteVisual.attack(1);
      }
    });

    onNoteUp(({ scene }) => {
      if (scene.has(persistentNoteVisual)) {
        persistentNoteVisual.release();
      }
    });
  })
  .render();
```

### 2. Spring Circles (`/examples/circles`)

Creates circles on note press that bounce in with spring easing:

```typescript
createScene
  .withState({ index: 0 })
  .setup(({ onNoteDown, onNoteUp, state }) => {
    onNoteDown(({ scene, note, attack }) => {
      const { index } = state;
      state.index = (state.index + 1) % 7;

      scene.addWithKey(
        note,
        springCircle({ xOffset: -150 + index * 50 }).attack(attack),
      );
    });

    onNoteUp(({ scene, note }) => {
      scene.getByKey(note)?.release();
    });
  })
  .render();
```

### 3. Animated Bars (`/examples/bars`)

Vertical bars that spring up from the bottom with note-based positioning:

```typescript
createScene
  .setup(({ atStart, onNoteDown, onNoteUp }) => {
    const notes = ["C", "D", "E", "F", "G", "A", "B"];

    atStart(({ scene }) => {
      notes.forEach((note, index) => {
        scene.addPermanentlyWithKey(
          note,
          springRectangle({
            x: 100 + index * 120,
            y: 500,
            width: 80,
            height: 800,
          }),
        );
      });
    });

    onNoteDown(({ scene, note, attack }) => {
      scene.getByKey(note[0])?.attack(attack); // Use base note (C, D, etc.)
    });

    onNoteUp(({ scene, note }) => {
      scene.getByKey(note[0])?.release(2000); // 2-second release
    });
  })
  .render();
```

### 4. Interactive Piano (`/examples/piano`)

Full piano keyboard with attack/release animations:

- Static UI (window, buttons) rendered via `onRender` with `draw()`
- Dynamic piano keys (white/black) as MIDI visuals
- Keys extend downward on press, retract on release

```typescript
createScene
  .setup(({ atStart, onRender, onNoteDown, onNoteUp }) => {
    // Static window UI
    onRender(({ draw }) => {
      draw(({ background, rect, line, circle, text, withStyles }) => {
        background({ color: "#F7F2E7" });

        withStyles({ strokeStyle: "#666", strokeWidth: 3 }, () => {
          rect({ x: 100, y: 100, width: 800, height: 500, cornerRadius: 30 });
          line({ start: { x: 100, y: 170 }, end: { x: 900, y: 170 } });
          circle({ cx: 135, cy: 135, radius: 12, fillStyle: "#FF605C" });
          text("Liminalis Piano", { x: 700, y: 128, fontStyle: "18px serif" });
        });
      });
    });

    // Dynamic piano keys
    atStart(({ scene }) => {
      const notes = ["C4", "C#4", "D4", "D#4", "E4"];

      notes.forEach((note) => {
        const keyType = note.includes("#") ? "black" : "white";

        scene.addPermanentlyWithKey(
          note,
          pianoKey({ x: 200, y: 250, keyType }),
        );
      });
    });

    onNoteDown(({ scene, note, attack }) => {
      scene.getByKey(note)?.attack(attack);
    });

    onNoteUp(({ scene, note }) => {
      scene.getByKey(note)?.release(1000);
    });
  })
  .render();
```

## API Reference

### `createScene`

Main entry point for creating visualizations.

#### Methods

##### `.withSettings(settings)`

Configure canvas dimensions and behavior:

```typescript
createScene.withSettings({
  width: 1080,
  height: 1920,
  fps: 60,
  computerKeyboardDebugEnabled: true,
});
```

##### `.withState(initialState)`

Provide stateful data that persists across renders:

```typescript
createScene.withState({ index: 0, score: 0 }).setup(({ state }) => {
  state.index += 1; // Mutate state directly
});
```

##### `.setup(setupFunction)`

Configure event handlers and initialize objects:

```typescript
createScene.setup(({ atStart, onNoteDown, onNoteUp, onRender }) => {
  // Setup code
});
```

**Setup Function Parameters:**

- `atStart(callback)` - Run once on initialization
- `onNoteDown(callback)` - Handle MIDI note press
- `onNoteUp(callback)` - Handle MIDI note release
- `onRender(callback)` - Render static content each frame
- `atTime(time, callback)` - Schedule callback at specific time
- `state` - Access state object (if using `.withState()`)
- `width`, `height` - Canvas dimensions
- `center` - `{ x, y }` center point

**onRender Callback Parameters:**

The `onRender` callback receives an object with:

- `draw(callback)` - Access 2D canvas primitives (`background`, `line`, `polygon`, `bezier`, `arc`, `circle`, `ellipse`, `rect`, `text`, `withStyles`, etc.)
- `renderIsometric(callback)` - Access isometric 3D primitives (cuboid, tile, withStyles)
- `time` - Current time in milliseconds
- `width`, `height` - Canvas dimensions
- `center` - Canvas center point

##### `.render()`

Start the visualization loop:

```typescript
createScene
  .setup(...)
  .render();
```

### `visual<TProps>(renderer)`

Create a reusable visual component factory with full TypeScript inference.

```typescript
const pulseCircle = visual<{ color: string; size: number }>(
  ({ props, draw }) => {
    draw(({ circle, center }) => {
      circle({
        cx: center.x,
        cy: center.y,
        radius: props.size,
        fillStyle: props.color,
      });
    });
  },
);

const myObject = pulseCircle({ color: "#FF605C", size: 80 });
```

#### Component Invocation

For components with props, pass props when creating an instance:

```typescript
const springCircle = visual<{ xOffset: number }>(({ props, draw }) => {
  draw(({ circle, center }) => {
    circle({ cx: center.x + props.xOffset, cy: center.y, radius: 50 });
  });
});

const circle = springCircle({ xOffset: 120 });
```

For components without props, call with no arguments:

```typescript
const flash = visual(({ draw }) => {
  draw(({ center, circle }) => {
    circle({ cx: center.x, cy: center.y, radius: 40 });
  });
});

const flashInstance = flash();
```

#### Visual Instance Methods

Instances created from a component support lifecycle methods:

```typescript
const instance = pulseCircle({ color: "#333", size: 120 });

instance.attack(0.8);
instance.sustain(250);
instance.release(700);
```

#### Render Context

The renderer callback passed into `visual(...)` receives:

- **Lifecycle**: `status`, `attackValue`, `releaseFactor`, `timeAttacked`, `timeReleased`, `timeFirstRender`
- **Properties**: `props` (custom props passed during component invocation)
- **Rendering**: `draw(callback)`, `renderIsometric(callback)`
- **Timing**: `beforeTime`, `afterTime`, `duringTimeInterval`

> **Note:** Shape primitives returned by `draw()` support the `.animateTo()` method for declarative animations.

**Draw Callback (2D Canvas):**

- **Canvas**: `context`, `width`, `height`, `center`
- **Primitives**: `background`, `line`, `polygon`, `bezier`, `arc`, `circle`, `ellipse`, `rect`, `text`
- **Styling**: `withStyles`

**Render Isometric Callback (3D Projection):**

- **Isometric Primitives**: `cuboid`, `tile`
- **Styling**: `withStyles`

##### `.attack(velocity)`

Trigger attack phase (typically called in `onNoteDown`):

```typescript
myObject.attack(0.8); // Attack with velocity 0.8
```

##### `.release(duration?)`

Trigger release phase (typically called in `onNoteUp`):

```typescript
myObject.release(1000); // Release over 1000ms
```

### Canvas Primitives

All primitives are available in both `onRender` and animatable renderers.

#### `background({ color })`

```typescript
background({ color: "#F7F2E7" });
background({ color: "beige" });
```

#### `line({ start, end, strokeStyle?, strokeWidth?, opacity?, blend?, rotate?, rotateOrigin?, scale?, scaleX?, scaleY?, scaleOrigin? })`

```typescript
line({
  start: { x: 100, y: 100 },
  end: { x: 500, y: 100 },
  strokeStyle: "#666",
  strokeWidth: 3,
  blend: "multiply",
});
```

#### `polygon({ points, closePath?, strokeStyle?, strokeWidth?, strokeAlignment?, opacity?, blend?, rotate?, rotateOrigin?, scale?, scaleX?, scaleY?, scaleOrigin? })`

```typescript
polygon({
  points: [
    { x: 120, y: 180 },
    { x: 220, y: 120 },
    { x: 300, y: 200 },
    { x: 180, y: 260 },
  ],
  closePath: true,
  strokeStyle: "#666",
  strokeWidth: 4,
  strokeAlignment: "inside",
  blend: "overlay",
});
```

#### `bezier({ segments, closePath?, fillStyle?, strokeStyle?, strokeWidth?, strokeAlignment?, opacity?, blend?, rotate?, rotateOrigin?, scale?, scaleX?, scaleY?, scaleOrigin? })`

```typescript
bezier({
  segments: [
    { point: { x: 100, y: 160 } },
    { control: { x: 160, y: 80 }, point: { x: 220, y: 160 } },
    {
      control: [
        { x: 280, y: 240 },
        { x: 340, y: 80 },
      ],
      point: { x: 400, y: 160 },
    },
  ],
  strokeStyle: "#666",
  fillStyle: "transparent",
  strokeWidth: 3,
  blend: "screen",
});
```

#### `arc({ cx, cy, radius | (radiusX, radiusY), start, end, fillStyle?, strokeStyle?, strokeWidth?, strokeAlignment?, opacity?, blend?, rotate?, rotateOrigin?, scale?, scaleX?, scaleY?, scaleOrigin? })`

```typescript
arc({
  cx: 400,
  cy: 260,
  radius: 90,
  start: 20,
  end: 320,
  fillStyle: "transparent",
  strokeStyle: "#666",
  strokeWidth: 8,
  blend: "multiply",
});
```

#### `circle({ cx, cy, radius, fillStyle?, strokeStyle?, strokeWidth?, opacity?, blend?, strokeAlignment?, rotate?, rotateOrigin?, scale?, scaleX?, scaleY?, scaleOrigin? })`

```typescript
circle({
  cx: 400,
  cy: 300,
  radius: 50,
  fillStyle: "#FF605C",
  strokeStyle: "#666",
  strokeWidth: 2,
  opacity: 1,
  blend: "source-over",
  strokeAlignment: "center", // "center" (default), "inside", or "outside"
});
```

#### `ellipse({ cx, cy, radiusX, radiusY, fillStyle?, strokeStyle?, strokeWidth?, opacity?, blend?, strokeAlignment?, rotate?, rotateOrigin?, scale?, scaleX?, scaleY?, scaleOrigin? })`

```typescript
ellipse({
  cx: 600,
  cy: 300,
  radiusX: 120,
  radiusY: 60,
  fillStyle: "transparent",
  strokeStyle: "#666",
  strokeWidth: 3,
  blend: "difference",
});
```

#### `rect({ x?, y?, width, height, fillStyle?, strokeStyle?, cornerRadius?, opacity?, blend?, strokeAlignment?, rotate?, rotateOrigin?, scale?, scaleX?, scaleY?, scaleOrigin? })`

```typescript
rect({
  x: 100,
  y: 100,
  width: 800,
  height: 500,
  cornerRadius: 30,
  fillStyle: "transparent",
  strokeStyle: "#666",
  strokeWidth: 3,
  opacity: 0.8,
  blend: "source-over",
  strokeAlignment: "center", // "center" (default), "inside", or "outside"
});
```

#### `text(content, { x?, y?, fontStyle?, fillStyle?, strokeStyle?, strokeWidth?, opacity?, blend?, rotate?, rotateOrigin?, scale?, scaleX?, scaleY?, scaleOrigin? })`

```typescript
text("Hello World", {
  x: 40,
  y: 80,
  fontStyle: "24px serif",
  fillStyle: "#333",
});

text("Rotated Label", {
  x: 300,
  y: 180,
  rotate: -12,
  rotateOrigin: "center",
  blend: "multiply",
  strokeStyle: "#222",
  strokeWidth: 2,
});
```

Text rendering defaults:

- `fontStyle`: `"12pt sans-serif"`
- `fillStyle`: `"#333"`
- `strokeStyle`: `"transparent"` (no stroke unless specified)
- Text is rendered with `textBaseline = "top"`, so `x` and `y` map to top-based positioning.
- Center-based transforms are calculated from measured text bounds.

### Styling & Transformations

#### `withStyles(styles, callback)`

Apply styles within a scope:

```typescript
withStyles({ strokeStyle: "#666", strokeWidth: 3, blend: "multiply" }, () => {
  circle({ cx: 100, cy: 100, radius: 50 });
  rect({ x: 200, y: 200, width: 100, height: 100 });
});
// Styles automatically restored after callback
```

#### Blend Mode

All shape primitives support `blend`, which maps to canvas `globalCompositeOperation`.

```typescript
withStyles({ blend: "multiply" }, () => {
  circle({ cx: 300, cy: 200, radius: 90 });

  // Per-shape blend can override scoped blend.
  rect({
    x: 260,
    y: 160,
    width: 150,
    height: 120,
    fillStyle: "#ff605c",
    blend: "difference",
  });
});
```

#### Transform Props

All shape primitives (`line`, `polygon`, `bezier`, `arc`, `circle`, `ellipse`, `rect`, `text`) support transform properties that are applied at render time:

**Rotation:**

```typescript
rect({
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  rotate: 45, // Rotate 45 degrees
  rotateOrigin: "center", // "center" (default) or local {x, y} coordinates
});
```

**Scale:**

```typescript
circle({
  cx: 200,
  cy: 200,
  radius: 50,
  scale: 1.5, // Uniform scale (150%)
  scaleOrigin: "center", // "center" (default) or local {x, y} coordinates
});

rect({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  scaleX: 2, // Stretch horizontally
  scaleY: 0.5, // Compress vertically
});
```

**Local Coordinate System for Transform Origins:**

When specifying a `Point2D` for `rotateOrigin` or `scaleOrigin`, coordinates are relative to the shape's local coordinate system (top-left of the shape is `{x: 0, y: 0}`):

```typescript
// Rotate around the shape's top-left corner
rect({
  x: 200,
  y: 200,
  width: 200,
  height: 200,
  rotate: 45,
  rotateOrigin: { x: 0, y: 0 }, // Local top-left = world (200, 200)
});

// Rotate around the shape's top-right corner
rect({
  x: 200,
  y: 200,
  width: 200,
  height: 200,
  rotate: 45,
  rotateOrigin: { x: 200, y: 0 }, // Local top-right = world (400, 200)
});

// Rotate around the shape's center (same as "center")
rect({
  x: 200,
  y: 200,
  width: 200,
  height: 200,
  rotate: 45,
  rotateOrigin: { x: 100, y: 100 }, // Local center = world (300, 300)
});
```

**Combined Transforms:**

```typescript
rect({
  x: 100,
  y: 100,
  width: 100,
  height: 100,
  rotate: 30,
  scale: 1.2,
  rotateOrigin: { x: 50, y: 50 }, // Rotate around local center
});
```

#### Stroke Alignment

The `strokeAlignment` property controls where the stroke is drawn relative to the shape's path. This matches the behavior of professional design tools like Figma and Sketch.

**Options:**

| Value       | Description                                                        |
| ----------- | ------------------------------------------------------------------ |
| `"center"`  | Stroke is centered on the path (default, standard canvas behavior) |
| `"inside"`  | Stroke is drawn entirely inside the shape bounds                   |
| `"outside"` | Stroke is drawn entirely outside the shape bounds                  |

**Usage:**

```typescript
// Default: stroke centered on the path
rect({ x: 100, y: 100, width: 200, height: 100, strokeWidth: 10 });

// Stroke inside the bounds
rect({
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  strokeWidth: 10,
  strokeAlignment: "inside",
});

// Stroke outside the bounds
rect({
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  strokeWidth: 10,
  strokeAlignment: "outside",
});

// Works the same for circles
circle({
  cx: 200,
  cy: 200,
  radius: 50,
  strokeWidth: 10,
  strokeAlignment: "inside",
});
```

**⚠️ Transparency Caveat:**

When using semi-transparent shapes (via the `opacity` property) with strokes, be mindful of how `strokeAlignment` affects the visual result:

- **`"center"` (default):** The stroke overlaps the fill by half its width. With transparency, this creates a visible "double opacity" effect where the stroke and fill overlap, making the edge appear darker than intended.

- **`"inside"` or `"outside"`:** The stroke and fill do not overlap, so transparency renders uniformly across the entire shape.

**Recommended:** If you're using transparency (`opacity < 1`) with strokes, prefer `strokeAlignment: "inside"` or `strokeAlignment: "outside"` to avoid the double-opacity overlap effect:

```typescript
// ❌ May produce unexpected darker edges with transparency
rect({
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  fillStyle: "#333",
  strokeWidth: 10,
  opacity: 0.5,
  strokeAlignment: "center", // Stroke overlaps fill
});

// ✅ Clean transparency - stroke doesn't overlap fill
rect({
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  fillStyle: "#333",
  strokeWidth: 10,
  opacity: 0.5,
  strokeAlignment: "inside", // No overlap
});
```

### Animation System

#### `.animateTo(targetProps, options)`

Animate shape properties over time. Available on `line()`, `polygon()`, `bezier()`, `arc()`, `circle()`, `ellipse()`, `rect()`, and `text()` primitives:

**Basic Usage:**

```typescript
rect({ x: 0, y: 50, width: 20, height: 20, fillStyle: "#ff0000" }).animateTo(
  { x: 100 },
  { duration: 1000 },
);
```

**Sequential Animations:**

```typescript
rect({ x: 0, y: 50, width: 20, height: 20, fillStyle: "#00ff00" })
  .animateTo({ x: 100 }, { duration: 1000 }) // 0-1s: move right
  .animateTo({ y: 150 }, { duration: 500 }); // 1-1.5s: move down
```

**Event-Based Timing:**

```typescript
circle({ cx: 50, cy: 50, radius: 50 })
  .animateTo(
    { radius: 100 },
    { at: timeAttacked, duration: 1000, easing: easeOutBounce },
  )
  .animateTo({ radius: 50 }, { at: timeReleased, duration: 1000 });
```

**Options:**

| Option     | Type                                | Description                                          |
| ---------- | ----------------------------------- | ---------------------------------------------------- |
| `at`       | `number \| null`                    | Start time (ms) or `null` for event-based            |
| `duration` | `number`                            | Duration in milliseconds                             |
| `endTime`  | `number`                            | Alternative to duration (absolute end time)          |
| `delay`    | `number`                            | Delay before starting (added to `at`)                |
| `easing`   | `((t: number) => number) \| string` | Easing function or easing-utils function name string |
| `reverse`  | `boolean`                           | Reverse the animation direction                      |

#### `.withOptions(options)`

Apply default options to all subsequent `.animateTo()` calls:

```typescript
circle({ cx: 100, cy: 100, radius: 50 })
  .withOptions({ duration: 500, easing: easeOutBounce })
  .animateTo({ radius: 100 }) // Uses defaults
  .animateTo({ radius: 150 }) // Uses defaults
  .animateTo({ radius: 200 }, { duration: 1000 }); // Override duration
```

**Stacking Options:**

```typescript
circle({ cx: 100, cy: 100, radius: 50 })
  .withOptions({ duration: 500 })
  .withOptions({ delay: 100 }) // Now has both duration and delay
  .animateTo({ radius: 100 });
```

**Common Easing Functions** (via `easing-utils`):

- `easeOutBounce`
- `easeOutBack`
- `easeInCubic`
- `easeOutCubic`
- `easeInOutCubic`

### Scene Manager

Manages lifecycle of animatable objects.

#### Instance-Based Operations

Use these when you already hold instance references in scope.

##### `scene.addPermanently(instance)`

```typescript
const permanent = floatingSquare({ squareDimensions: 200 });
scene.addPermanently(permanent);
```

##### `scene.add(instance)`

```typescript
const transient = floatingSquare({ squareDimensions: 320 });
scene.add(transient);
transient.attack(1);
```

##### `scene.remove(instance)` / `scene.has(instance)`

```typescript
if (scene.has(transient)) {
  scene.remove(transient);
}
```

#### Key-Based Operations

Use these when mapping visuals to notes or other keys.

##### `scene.addPermanentlyWithKey(key, object)`

Add object that persists until explicitly removed:

```typescript
scene.addPermanentlyWithKey("my-circle", springCircle({ xOffset: 50 }));
```

##### `scene.addWithKey(key, object)`

Add object that's removed after release completes:

```typescript
scene.addWithKey(note, springCircle({ xOffset: 100 }));
```

##### `scene.getByKey(key)`

Retrieve an object by ID:

```typescript
const obj = scene.getByKey("my-circle");
obj?.attack(0.8);
obj?.release(1000);
```

##### `scene.removeByKey(key)` / `scene.hasKey(key)`

```typescript
if (scene.hasKey("C4")) {
  scene.removeByKey("C4");
}
```

> Note: key-based add methods clone the supplied object definition so each key manages an independent visual instance.

## Development

### Contributing to Liminalis

Want to contribute to the library or add new features? We've set up a development workflow that lets you test changes against real-world scaffolded projects.

**See [DEVELOPMENT.md](./DEVELOPMENT.md) for the complete guide.**

#### Quick Start for Contributors

1. **Clone and setup**:

```bash
git clone https://github.com/twray/liminalis.git
cd liminalis
npm install
npm run build
npm link
```

2. **Start development mode** (Terminal 1):

```bash
npm run dev
```

3. **Create a test project** (Terminal 2):

```bash
npm run test:create
cd test-apps/test-<timestamp>
npm run dev
```

Now any changes to the library will automatically rebuild and hot-reload in your test project!

#### Available Development Commands

```bash
npm run dev                 # Build library in watch mode
npm run test:create         # Create test project
npm run test:all-templates  # Validate all templates
npm run test:dev            # Build + create + run (one command)
```

#### VS Code Integration

Press `Cmd+Shift+B` to access build tasks:

- **Build Library (Watch Mode)** - Default task
- **Create Test Project** - Quick test setup
- **🚀 Build + Create + Run** - Complete workflow

#### Testing Philosophy

We test library changes against projects created with `create-liminalis-app` to ensure:

- ✅ Real-world compatibility
- ✅ Template validation
- ✅ Breaking change detection
- ✅ Production parity

### Project Structure

```
liminalis/
├── src/
│   ├── core/           # Core framework code
│   ├── types/          # TypeScript type definitions
│   ├── util/           # Utility functions
│   ├── views/          # View rendering logic
│   ├── data/           # Color palettes and key mappings
│   ├── examples/       # Example visualizations
│   └── lib.ts          # Main library export
├── types/              # Additional type declarations
├── dist/               # Compiled output
└── README.md
```

### Building for Production

```bash
npm run build
```

### Publishing

The package is configured with automatic build on publish:

```bash
npm version patch  # or minor, or major
npm publish
```

## MIDI Setup

Liminalis uses WebMIDI to connect to MIDI devices. To use MIDI:

1. **Connect a MIDI controller** to your computer (via USB or Bluetooth)
2. **Allow MIDI access** when prompted by your browser
3. **Play notes** on your controller to trigger visualizations

### Computer Keyboard Debug Mode

For testing without a MIDI controller, Liminalis includes keyboard debug mode (enabled by default):

- Press number keys `1-9` to simulate different attack velocities
- The framework maps computer keys to MIDI note equivalents

Disable keyboard debug mode:

```typescript
createScene
  .withSettings({
    computerKeyboardDebugEnabled: false,
  })
  .setup(...)
  .render();
```

## Browser Compatibility

Liminalis requires a modern browser with support for:

- WebMIDI API (Chrome, Edge, Opera)
- Canvas 2D rendering
- ES2020+ JavaScript features

For browsers without WebMIDI support, use a polyfill like [webmidi](https://www.npmjs.com/package/webmidi).

## License

MIT © Tim Wray

```

```
