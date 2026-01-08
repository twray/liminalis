# Liminalis

A creative coding framework for building real-time music visualizations in TypeScript. Liminalis provides first-class support for MIDI events, animatable objects with lifecycle hooks, and a powerful timeline animation system—all designed to create responsive, interactive visual experiences.

## Features

- 🎹 **Native MIDI Support**: Built-in `onNoteDown` and `onNoteUp` event handlers for seamless MIDI integration
- 🎨 **Lifecycle-Driven Animations**: Objects respond to attack, sustain, and release phases with automatic state management
- ⏱️ **Timeline Animation System**: Create smooth, overlapping animations with event-based timing
- 🖼️ **Unified Rendering API**: Compose 2D canvas primitives and isometric views in the same render operation
- 🎭 **Canvas Primitives**: Expressive API with stateful styling, transformations, and easing functions
- 🎲 **Isometric Rendering**: Built-in isometric projection with cuboids and tiles

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
  - [MIDI Event Handling](#midi-event-handling)
  - [Animatable Objects & Lifecycle](#animatable-objects--lifecycle)
  - [Rendering Strategies](#rendering-strategies)
  - [Timeline Animations](#timeline-animations)
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
import { createVisualisation, midiVisual } from "liminalis";
import { easeOutBounce } from "easing-utils";

createVisualisation
  .setup(({ atStart, onNoteDown, onNoteUp }) => {
    // Create a circle that responds to MIDI
    atStart(({ visualisation }) => {
      visualisation.addPermanently(
        "circle",
        midiVisual().withRenderer(
          ({ draw, animate, timeAttacked, timeReleased }) => {
            draw(({ circle, center }) => {
              circle({
                cx: center.x,
                cy: center.y,
                radius: animate([
                  {
                    startTime: timeAttacked,
                    from: 50,
                    to: 150,
                    duration: 1000,
                    easing: easeOutBounce,
                  },
                  {
                    startTime: timeReleased,
                    from: 150,
                    to: 50,
                    duration: 1000,
                  },
                ]),
                strokeStyle: "#666",
              });
            });
          }
        )
      );
    });

    // Trigger attack on MIDI note press
    onNoteDown(({ visualisation }) => {
      visualisation.get("circle")?.attack(1);
    });

    // Trigger release on MIDI note release
    onNoteUp(({ visualisation }) => {
      visualisation.get("circle")?.release();
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

### Alternative: canvas-sketch CLI

If you prefer canvas-sketch's workflow:

1. **Install globally**:

```bash
npm install -g canvas-sketch-cli
```

2. **Build and run**:

```bash
npx tsc
canvas-sketch dist/index.js --hot
```

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
createVisualisation
  .setup(({ onNoteDown, visualisation }) => {
    onNoteDown(({ note, attack, visualisation }) => {
      // 'note' is the MIDI note name (e.g., "C4", "A#3")
      // 'attack' is normalized velocity (0.0 to 1.0)

      console.log(`Note: ${note}, Velocity: ${attack}`);
    });
  })
  .render();
```

#### `onNoteUp` - Triggered when a MIDI note is released

```typescript
createVisualisation
  .setup(({ onNoteUp, visualisation }) => {
    onNoteUp(({ note, visualisation }) => {
      // Handle note release
      visualisation.get(note)?.release();
    });
  })
  .render();
```

#### Example: Piano Keyboard Visualization

```typescript
createVisualisation
  .setup(({ atStart, onNoteDown, onNoteUp }) => {
    const notes = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"];

    atStart(({ visualisation }) => {
      // Create a piano key for each note
      notes.forEach((note, index) => {
        visualisation.addPermanently(
          note,
          pianoKey().withProps({ x: index * 60, y: 100 })
        );
      });
    });

    onNoteDown(({ visualisation, note, attack }) => {
      // Trigger attack animation on the corresponding key
      visualisation.get(note)?.attack(attack);
    });

    onNoteUp(({ visualisation, note }) => {
      // Trigger release animation
      visualisation.get(note)?.release();
    });
  })
  .render();
```

### Animatable Objects & Lifecycle

The heart of Liminalis is the **animatable object system**. Objects can respond to MIDI lifecycle events (attack, sustain, release) with automatic state tracking and timing.

#### Creating MIDI Visuals

```typescript
import { midiVisual } from "liminalis";
import { easeOutBounce } from "easing-utils";

const springCircle = () => {
  return midiVisual<{ xOffset: number }>().withRenderer(
    ({ props, draw, attackValue, releaseFactor, animate }) => {
      draw(({ circle, center }) => {
        const { xOffset = 0 } = props;
        const { x: cx, y: cy } = center;

        circle({
          cx: cx + xOffset,
          cy,
          radius: animate({
            from: 0,
            to: 100 * attackValue, // Scale by attack velocity
            duration: 1000,
            easing: easeOutBounce,
          }),
          strokeStyle: "#666",
          opacity: releaseFactor, // Fade during release
        });
      });
    }
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
  return midiVisual<{ x: number; y: number }>().withRenderer(
    ({ props, draw, status, animate, timeAttacked, timeReleased }) => {
      draw(({ rect }) => {
        const { x, y } = props;

        let heightExtension = 0;

        // Render differently based on lifecycle state
        switch (status) {
          case "sustained":
            heightExtension = animate({
              startTime: timeAttacked,
              from: 0,
              to: 20,
              duration: 500,
              easing: easeOutBack,
            });
            break;

          case "releasing":
            heightExtension = animate({
              startTime: timeReleased,
              from: 20,
              to: 0,
              duration: 500,
              easing: easeOutBack,
            });
            break;
        }

        rect({
          x,
          y,
          width: 60,
          height: 200 + heightExtension,
          strokeStyle: "#666",
        });
      });
    }
  );
};
```

#### Managing Objects

```typescript
// Add an object permanently (persists across frames)
visualisation.addPermanently(
  "my-circle",
  springCircle().withProps({ xOffset: 50 })
);

// Add an object temporarily (removed after release completes)
visualisation.add("temp-circle", springCircle().withProps({ xOffset: 100 }));

// Trigger lifecycle events
visualisation.get("my-circle")?.attack(0.8); // Attack with velocity 0.8
visualisation.get("my-circle")?.release(1000); // Release over 1000ms

// Retrieve current object
const obj = visualisation.get("my-circle");
```

### Rendering Strategies

Liminalis provides a unified, composable rendering API that allows you to combine 2D canvas primitives and isometric 3D projections in the same frame.

#### Composable Rendering API

Both `onRender` (for static content) and `.withRenderer()` (for MIDI visuals) use the same composable structure:

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
createVisualisation
  .setup(({ atStart, onNoteDown, onNoteUp }) => {
    atStart(({ visualisation }) => {
      // Add MIDI visual
      visualisation.addPermanently(
        "note",
        midiVisual().withRenderer(
          ({ draw, animate, timeAttacked, timeReleased }) => {
            draw(({ circle, center }) => {
              circle({
                cx: center.x,
                cy: center.y,
                radius: animate([
                  {
                    startTime: timeAttacked,
                    from: 50,
                    to: 100,
                    duration: 1000,
                  },
                  {
                    startTime: timeReleased,
                    from: 100,
                    to: 50,
                    duration: 1000,
                  },
                ]),
              });
            });
          }
        )
      );
    });

    onNoteDown(({ visualisation }) => {
      visualisation.get("note")?.attack(1);
    });

    onNoteUp(({ visualisation }) => {
      visualisation.get("note")?.release();
    });
  })
  .render();
```

#### 2. Static Rendering (Per-Frame)

Use `onRender` with `draw()` for static elements that don't need lifecycle management:

```typescript
createVisualisation
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
createVisualisation
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
    atStart(({ visualisation }) => {
      const notes = ["C4", "D4", "E4", "F4", "G4"];
      notes.forEach((note, i) => {
        visualisation.addPermanently(
          note,
          pianoKey().withProps({ x: 200 + i * 65, y: 250 })
        );
      });
    });

    onNoteDown(({ visualisation, note, attack }) => {
      visualisation.get(note)?.attack(attack);
    });
```

#### Composing 2D and Isometric Together

You can seamlessly mix 2D UI elements with 3D isometric visualizations:

```typescript
createVisualisation
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
    onNoteDown(({ visualisation, note }) => {
      visualisation.add(
        note,
        midiVisual()
          .withRenderer(({ draw, renderIsometric, releaseFactor }) => {
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
          })
          .attack(1)
      );
    });

    onNoteUp(({ visualisation, note }) => {
      visualisation.get(note)?.release(500);
    });
  })
  .render();
```

    onNoteUp(({ visualisation, note }) => {
      visualisation.get(note)?.release(1000);
    });

})
.render();

````

### Timeline Animations

Liminalis features a powerful timeline animation system that supports:

- **Event-based timing** using `timeAttacked`, `timeReleased`, `timeFirstRender`
- **Smooth overlapping** - animations blend seamlessly when events occur rapidly
- **Cumulative properties** - timeline segments inherit properties from previous segments

#### Single Animation

```typescript
animate({
  from: 0,
  to: 100,
  duration: 1000,
  easing: easeOutBounce,
  delay: 200,
});
````

#### Timeline Array (Attack → Release)

```typescript
animate([
  {
    startTime: timeAttacked, // Event-based timing
    from: 50,
    to: 100,
    duration: 1000,
  },
  {
    startTime: timeReleased,
    from: 100, // Explicit from value
    to: 50,
    duration: 1000,
  },
]);
```

#### Smooth Overlap Handling

When `timeReleased` occurs before the attack animation completes, Liminalis automatically:

1. Detects the overlap
2. Calculates the interpolated value at the moment of release
3. Uses that value as the starting point for the release animation

**Example**: If attack animates 50→100 over 1000ms, but release occurs at 200ms (when value is ~60), the release animation smoothly continues from 60→50.

#### Animation Options

```typescript
interface AnimationOptions {
  from: number; // Start value
  to: number; // End value
  startTime?: number | null; // When to start (ms or event time)
  duration?: number; // Duration in ms
  endTime?: number; // Alternative: absolute end time
  delay?: number; // Delay before starting
  easing?: (t: number) => number; // Easing function (0→1)
  reverse?: boolean; // Reverse the animation
}
```

## Examples

### 1. Simple Circles (`/examples/animatable-circles`)

Demonstrates both rendering strategies in one visualization:

- **Dynamic circles** that respond to MIDI attack/release
- **Static circles** animated via `onRender` with staggered delays

```typescript
createVisualisation
  .setup(({ atStart, onRender, onNoteDown, onNoteUp }) => {
    // Dynamic MIDI-responsive circle
    atStart(({ visualisation }) => {
      visualisation.addPermanently(
        "note",
        midiVisual().withRenderer(({ draw }) => {
          draw(({ circle, center }) => {
            // ...rendering logic
          });
        })
      );
    });

    // Static animated circles
    onRender(({ draw, animate }) => {
      draw(({ circle, center }) => {
        for (let i = 0; i < 3; i++) {
          circle({
            cx: center.x + i * 40 - 40,
            cy: animate({
              from: center.y - 200,
              to: center.y - 100,
              duration: 1000,
              delay: 500 + i * 250,
            }),
            radius: 10,
          });
        }
      });
    });

    onNoteDown(({ visualisation }) => visualisation.get("note")?.attack(1));
    onNoteUp(({ visualisation }) => visualisation.get("note")?.release());
  })
  .render();
```

### 2. Spring Circles (`/examples/circles`)

Creates circles on note press that bounce in with spring easing:

```typescript
createVisualisation
  .withState({ index: 0 })
  .setup(({ onNoteDown, onNoteUp, state }) => {
    onNoteDown(({ visualisation, note, attack }) => {
      const { index } = state;
      state.index = (state.index + 1) % 7;

      visualisation.add(
        note,
        springCircle()
          .withProps({ xOffset: -150 + index * 50 })
          .attack(attack)
      );
    });

    onNoteUp(({ visualisation, note }) => {
      visualisation.get(note)?.release();
    });
  })
  .render();
```

### 3. Animated Bars (`/examples/bars`)

Vertical bars that spring up from the bottom with note-based positioning:

```typescript
createVisualisation
  .setup(({ atStart, onNoteDown, onNoteUp }) => {
    const notes = ["C", "D", "E", "F", "G", "A", "B"];

    atStart(({ visualisation }) => {
      notes.forEach((note, index) => {
        visualisation.addPermanently(
          note,
          springRectangle().withProps({
            x: 100 + index * 120,
            y: 500,
            width: 80,
            height: 800,
          })
        );
      });
    });

    onNoteDown(({ visualisation, note, attack }) => {
      visualisation.get(note[0])?.attack(attack); // Use base note (C, D, etc.)
    });

    onNoteUp(({ visualisation, note }) => {
      visualisation.get(note[0])?.release(2000); // 2-second release
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
createVisualisation
  .setup(({ atStart, onRender, onNoteDown, onNoteUp }) => {
    // Static window UI
    onRender(({ draw }) => {
      draw(({ background, rect, circle, withStyles }) => {
      background({ color: "#F7F2E7" });
      withStyles({ strokeStyle: "#666", strokeWidth: 3 }, () => {
        rect({ x: 100, y: 100, width: 800, height: 500, cornerRadius: 30 });
      });
    });

    // Dynamic piano keys
    atStart(({ visualisation }) => {
      const notes = ["C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", ...];
      notes.forEach((note) => {
        const keyType = note.includes("#") ? "black" : "white";
        visualisation.addPermanently(
          note,
          pianoKey().withProps({ keyType, ... })
        );
      });
    });

    onNoteDown(({ visualisation, note, attack }) => {
      visualisation.get(note)?.attack(attack);
    });

    onNoteUp(({ visualisation, note }) => {
      visualisation.get(note)?.release(1000);
    });
  })
  .render();
```

## API Reference

### `createVisualisation`

Main entry point for creating visualizations.

#### Methods

##### `.withSettings(settings)`

Configure canvas dimensions and behavior:

```typescript
createVisualisation.withSettings({
  width: 1080,
  height: 1920,
  fps: 60,
  computerKeyboardDebugEnabled: true,
});
```

##### `.withState(initialState)`

Provide stateful data that persists across renders:

```typescript
createVisualisation.withState({ index: 0, score: 0 }).setup(({ state }) => {
  state.index += 1; // Mutate state directly
});
```

##### `.setup(setupFunction)`

Configure event handlers and initialize objects:

```typescript
createVisualisation.setup(({ atStart, onNoteDown, onNoteUp, onRender }) => {
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

- `draw(callback)` - Access 2D canvas primitives (background, rect, circle, line, withStyles, etc.)
- `renderIsometric(callback)` - Access isometric 3D primitives (cuboid, tile, withStyles)
- `animate(options)` - Create time-based animations
- `time` - Current time in milliseconds
- `width`, `height` - Canvas dimensions
- `center` - Canvas center point

##### `.render()`

Start the visualization loop:

```typescript
createVisualisation
  .setup(...)
  .render();
```

### `midiVisual<TProps>()`

Create a MIDI-responsive visual object with custom properties.

```typescript
const myObject = midiVisual<{ color: string; size: number }>().withRenderer(
  ({ props, draw }) => {
    draw(({ circle, center }) => {
      circle({
        cx: center.x,
        cy: center.y,
        radius: props.size,
        fillStyle: props.color,
      });
    });
  }
);
```

#### Methods

##### `.withRenderer(renderFunction)`

Define how the object should be drawn:

```typescript
.withRenderer((context) => {
  // Access rendering methods via draw() and renderIsometric()
  context.draw(({ circle, rect, background }) => {
    // 2D canvas primitives
  });

  context.renderIsometric(({ cuboid, tile }) => {
    // Isometric 3D objects
  });
})
```

**Render Context:**

- **Lifecycle**: `status`, `attackValue`, `releaseFactor`, `timeAttacked`, `timeReleased`, `timeFirstRender`
- **Properties**: `props` (custom props passed via `.withProps()`)
- **Rendering**: `draw(callback)`, `renderIsometric(callback)`
- **Animation**: `animate(options)`
- **Timing**: `beforeTime`, `afterTime`, `duringTimeInterval`

**Draw Callback (2D Canvas):**

- **Canvas**: `context`, `width`, `height`, `center`
- **Primitives**: `background`, `rect`, `circle`, `line`
- **Styling**: `withStyles`, `translate`, `rotate`, `scale`

**Render Isometric Callback (3D Projection):**

- **Isometric Primitives**: `cuboid`, `tile`
- **Styling**: `withStyles`

##### `.withProps(properties)`

Attach custom properties to the object:

```typescript
springCircle().withProps({ xOffset: 100, color: "#FF0000" });
```

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

#### `rect({ x?, y?, width, height, fillStyle?, strokeStyle?, cornerRadius?, opacity? })`

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
});
```

#### `circle({ cx, cy, radius, fillStyle?, strokeStyle?, strokeWidth?, opacity? })`

```typescript
circle({
  cx: 400,
  cy: 300,
  radius: 50,
  fillStyle: "#FF605C",
  strokeStyle: "#666",
  strokeWidth: 2,
  opacity: 1,
});
```

#### `line({ start, end, strokeStyle?, strokeWidth? })`

```typescript
line({
  start: { x: 100, y: 100 },
  end: { x: 500, y: 100 },
  strokeStyle: "#666",
  strokeWidth: 3,
});
```

### Styling & Transformations

#### `withStyles(styles, callback)`

Apply styles within a scope:

```typescript
withStyles({ strokeStyle: "#666", strokeWidth: 3 }, () => {
  circle({ cx: 100, cy: 100, radius: 50 });
  rect({ x: 200, y: 200, width: 100, height: 100 });
});
// Styles automatically restored after callback
```

#### `translate(offset, callback)`

Translate origin within a scope:

```typescript
translate({ x: 100, y: 50 }, () => {
  circle({ cx: 0, cy: 0, radius: 50 }); // Drawn at (100, 50)
});
```

#### `rotate(angle, callback)`

Rotate canvas (angle in radians):

```typescript
rotate(Math.PI / 4, () => {
  rect({ x: 0, y: 0, width: 100, height: 100 });
});
```

#### `scale(factor, callback)`

Scale canvas:

```typescript
scale({ x: 2, y: 2 }, () => {
  circle({ cx: 50, cy: 50, radius: 25 }); // Drawn twice as large
});
```

### Animation System

#### `animate(options | options[])`

Animate a value over time:

**Single Animation:**

```typescript
const radius = animate({
  from: 0,
  to: 100,
  duration: 1000,
  easing: easeOutBounce,
});
```

**Timeline (Array):**

```typescript
const radius = animate([
  {
    startTime: timeAttacked,
    from: 50,
    to: 100,
    duration: 1000,
  },
  {
    startTime: timeReleased,
    from: 100,
    to: 50,
    duration: 1000,
  },
]);
```

**Options:**

- `from` - Start value
- `to` - End value
- `startTime` - When to start (ms, or `null` to skip)
- `duration` - Duration in milliseconds
- `endTime` - Alternative to duration (absolute time)
- `delay` - Delay before starting
- `easing` - Easing function `(t: number) => number`
- `reverse` - Reverse the animation

**Common Easing Functions** (via `easing-utils`):

- `easeOutBounce`
- `easeOutBack`
- `easeInCubic`
- `easeOutCubic`
- `easeInOutCubic`

### Visualisation Manager

Manages lifecycle of animatable objects.

#### `visualisation.addPermanently(id, object)`

Add object that persists until explicitly removed:

```typescript
visualisation.addPermanently(
  "my-circle",
  springCircle().withProps({ xOffset: 50 })
);
```

#### `visualisation.add(id, object)`

Add object that's removed after release completes:

```typescript
visualisation.add(note, springCircle().withProps({ xOffset: 100 }));
```

#### `visualisation.get(id)`

Retrieve an object by ID:

```typescript
const obj = visualisation.get("my-circle");
obj?.attack(0.8);
obj?.release(1000);
```

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
createVisualisation
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
