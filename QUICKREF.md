# Liminalis Development Quick Reference

## 🚀 One-Command Workflow

```bash
npm run test:dev
```

Builds library → Creates test project → Starts dev server

---

## 📋 Common Commands

### Library Development

| Command                    | Description              |
| -------------------------- | ------------------------ |
| `npm run dev`              | Build in watch mode      |
| `npm run build`            | Build once               |
| `npm run type-check:watch` | Type-check in watch mode |

### Testing

| Command               | Description                 |
| --------------------- | --------------------------- |
| `npm run test:create` | Create default test project |

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
2. Check library is linked: `npm link`
3. Check test project is linked: `cd test-project && npm link liminalis`

---

## 📁 Key Locations

- **Library:** `/Users/timwray/dev/liminalis`
- **Test Apps:** `/Users/timwray/dev/liminalis/test-apps`
- **CLI Tool:** `/Users/timwray/dev/create-liminalis-app`

---

## 🧪 Before Releasing

```bash
npm run test:all-templates
```

Tests all templates to catch breaking changes!

---

**Full Documentation:** See [DEVELOPMENT.md](./DEVELOPMENT.md)
