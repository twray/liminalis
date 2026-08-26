# Liminalis Development Quick Reference

## 🚀 One-Command Workflow

```bash
npm run test:dev
```

Builds the library, then runs `test:create`.

By default, `test:create` will:

1. Link the local library
2. Scaffold a test project in `test-apps/`
3. Install dependencies
4. Start the test project's dev server

---

## 📋 Common Commands

### Library Development

| Command                    | Description              |
| -------------------------- | ------------------------ |
| `npm run dev`              | Build in watch mode      |
| `npm run build`            | Build once               |
| `npm run type-check`       | Type-check without build |
| `npm run type-check:watch` | Type-check in watch mode |
| `npm run test:link`        | Link library globally    |

### Validation

| Command                      | Description                   |
| ---------------------------- | ----------------------------- |
| `npm test`                   | Run library test suite        |
| `npm run test:watch`         | Run tests in watch mode       |
| `npm run test:all-templates` | Validate all CLI templates    |
| `npm run test:create`        | Create default test project   |
| `npm run test:dev`           | Build + create + start an app |

---

## 🔄 Typical Workflow

**Terminal 1:**

```bash
cd /Users/timwray/dev/liminalis
npm run dev
```

**Terminal 2:**

```bash
npm run test:create
cd test-apps/test-<timestamp>
npm run dev
```

**Edit** `src/` → TypeScript rebuilds → Vite hot-reloads → See changes instantly!

---

## 🎬 Scene API Sanity Checks

Use this checklist when updating examples or docs:

- Use `createScene`, not `createVisualisation`
- Use `visual(renderer)` component factories
- Instantiate before registration (`visual(renderer)()` or `component(props)`)
- Use keyed methods with explicit naming: `addWithKey`, `addPermanentlyWithKey`, `getByKey`
- Use instance methods when holding references: `add`, `addPermanently`, `remove`, `has`
- Document and demo blend mode as `blend` (including `withStyles({ blend })`)
- Include all current primitives in docs/examples where relevant: `line`, `polygon`, `bezier`, `arc`, `circle`, `ellipse`, `rect`, `text`, `image`, `group`, `layer`
- Use `showBounds` (not `debugBounds`) when documenting group bounds visualisation
- When documenting `image`, include `fit` modes and scaled-frame behavior (`cover` default, `contain`, `stretch`)
- Prefer `measurements` for scene and explicitly sized containers; use `hasMeasurements` + `getMeasurements()` for implicitly sized containers
- Prefer easing string constants in quick examples when imports are unnecessary (example: `"easeOutBack"`)

---

## 🎨 VS Code Tasks (Cmd+Shift+B)

- **Build Library (Watch Mode)** - Default build task
- **Create Test Project (Default)** - Quick test setup
- **🚀 Build + Create + Run Test Project** - Complete workflow

---

## 💡 Pro Tips

### Clean Rebuild

```bash
npm run clean && npm run build && npm link
```

### Multiple Test Projects

Keep different projects for different features:

```bash
npm run test:create -- --name test-animation
npm run test:create -- --name test-midi
```

### Hot Reload Not Working?

1. Check library is built: `ls dist/lib.js`
2. Re-link library globally: `npm run test:link`
3. Re-link in test project: `cd test-apps/<project-name> && npm link liminalis`
4. Restart the test project's dev server

---

## 📁 Key Locations

- **Library root:** `.`
- **Test apps:** `test-apps/`
- **Project creator script:** `scripts/create-test-project.js`
- **Template validator script:** `scripts/test-all-templates.js`

---

## 🧪 Before Releasing

```bash
npm test
npm run build
npm run test:all-templates
```

Tests all templates to catch breaking changes!

---

**Full Documentation:** See [DEVELOPMENT.md](./DEVELOPMENT.md)
