# liminalis

A creative coding framework for building real-time music visualizations, with
native MIDI support, lifecycle-driven animations, and timeline-based
rendering. `src/` is the core framework, published as the `liminalis` npm
package.

## Repository layout

- `src/` — the framework itself (tracked).
- `test-apps/` — local dev harness (gitignored, **not tracked in git**). Holds
  real scaffolded Vite projects (e.g. `bars-animation`, `text-rendering`) used
  to visually/experientially test the framework in a browser. Each one is
  created via `create-liminalis-app` / `npm run test:create` and links back to
  this repo with `npm link liminalis` (`node_modules/liminalis -> ../../..`).
  Dev loop: `npm run dev` here (tsc watch) + the test app's own `npm run dev`
  (Vite) in another terminal — source changes show up via HMR. Full workflow
  docs: `test-apps/README.md`.

  **Caveat:** because `test-apps/` is gitignored, Grep/Glob and the Explore
  agent skip it by default (ripgrep respects `.gitignore`) and will silently
  return nothing from it. Use Bash (`find`/`grep`) or Read directly by path
  when looking for something inside `test-apps/`.

## Explanation of refactors, edits and walkthroughs

When editing, planning or suggesting changes, please adhere to the software
engineering principles of DRY and SOLID, explain how your changes adhere to those
principles. Once refactored or explained, discuss how the function fits into
the overall architeture of the application, with examples of where it is used
and how data flows in and out of it.
