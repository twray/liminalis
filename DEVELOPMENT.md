# Liminalis Development Workflow

This guide explains how to develop and test new features for the Liminalis library.

## 🎯 Philosophy

Test library changes against **real-world scaffolded projects** using `create-liminalis-app` to ensure production parity and catch breaking changes early.

## 🚀 Quick Start

### One-Command Testing

```bash
npm run test:dev
```

This will:

1. Build the library
2. Create a test project using create-liminalis-app
3. Link your local library
4. Install dependencies
5. Start the dev server

### Manual Workflow

**Terminal 1 - Library in watch mode:**

```bash
npm run dev
```

**Terminal 2 - Create and run test project:**

```bash
npm run test:create
cd test-apps/test-<timestamp>
npm run dev
```

Now any changes to library source code will automatically rebuild and hot-reload in your test project via Vite!

## 📋 Available Commands

### Library Development

```bash
npm run build              # Build once
npm run dev                # Build in watch mode
npm run build:watch        # Alias for dev
npm run type-check         # Check types without building
npm run type-check:watch   # Type-check in watch mode
npm run lint               # Strict type checking
```

### Testing

```bash
npm run test:link          # Link library globally
npm run test:create        # Create default test project
npm run test:all-templates # Test all templates
npm run test:dev           # Build + create + run
```

### Script Options

Create test projects with specific templates:

```bash
npm run test:create -- --template animated-circles
npm run test:create -- --template midi-piano
npm run test:create -- --name my-feature-test
```

Skip certain steps:

```bash
node scripts/create-test-project.js --skip-install
node scripts/create-test-project.js --skip-link
node scripts/create-test-project.js --skip-dev
```

## 🎨 VS Code Integration

### Tasks (Cmd+Shift+B)

- **Build Library (Watch Mode)** - Default build task, runs in background
- **Build Library (Once)** - Single build
- **Create Test Project (Default)** - Quick test project creation
- **Create Test Project (Animated Circles)** - With specific template
- **Create Test Project (MIDI Piano)** - Piano template
- **Test All Templates** - Validate all templates work
- **🚀 Build + Create + Run Test Project** - Complete workflow

### Run Configurations (F5)

- **Create Test Project** - Debug the creation script
- **Test All Templates** - Debug template validation

## 📁 Project Structure

```
liminalis/
├── src/                           # Library source code
├── dist/                          # Built library (gitignored)
├── test-apps/                     # Test projects (gitignored)
│   ├── test-*/                    # Generated test projects
│   └── README.md
├── scripts/
│   ├── create-test-project.js     # Automated test project setup
│   └── test-all-templates.js      # Template validation
├── .vscode/
│   ├── tasks.json                 # VS Code tasks
│   └── launch.json                # Debug configurations
└── package.json
```

## 🔄 Development Workflow

### Adding a New Feature

1. **Start library in watch mode:**

   ```bash
   npm run dev
   ```

2. **Create test project:**

   ```bash
   npm run test:create
   cd test-apps/test-<timestamp>
   ```

3. **Edit library source** in `src/`

   - Changes automatically rebuild via TypeScript watch mode
   - Vite hot-reloads the test project instantly

4. **Test the feature** in your test project

5. **Validate against all templates:**
   ```bash
   npm run test:all-templates
   ```

### Breaking Change Detection

Before releasing, test all templates:

```bash
npm run test:all-templates
```

This creates projects for:

- Default template
- Animated circles
- MIDI piano

If any fail, you've introduced a breaking change!

## 🧪 Testing Strategies

### Quick Iteration

Use `npm run test:dev` for rapid feature testing with the default template.

### Template-Specific Testing

Test features that depend on specific templates:

```bash
npm run test:create -- --template midi-piano --name test-midi-fix
```

### Comprehensive Testing

Before merging or releasing:

```bash
npm run test:all-templates
```

### Manual Testing

For complex scenarios, manually create and customize test projects:

```bash
cd test-apps
create-liminalis-app my-custom-test
cd my-custom-test
npm link liminalis
npm install
# Modify src/index.ts as needed
npm run dev
```

## 💡 Tips

### Hot Reload Not Working?

Make sure:

1. Library is built: Check `dist/lib.js` exists
2. Library is linked: Run `npm link` in liminalis root
3. Test project is linked: Run `npm link liminalis` in test project
4. Watch mode is running: `npm run dev` in liminalis root

### Clean Slate

Remove all test projects:

```bash
cd test-apps
rm -rf test-*
```

### Version Mismatch

If experiencing weird behavior, rebuild everything:

```bash
# In liminalis/
npm run clean
npm run build
npm link

# In test project/
rm -rf node_modules package-lock.json
npm install
npm link liminalis
```

### Multiple Test Projects

Keep multiple test projects for different features:

```bash
npm run test:create -- --name test-animation-fix
npm run test:create -- --name test-midi-feature
npm run test:create -- --name test-performance
```

Switch between them as needed without recreating.

## 🔗 Links

- Main Library: `/Users/timwray/dev/liminalis`
- Test Apps: `/Users/timwray/dev/liminalis/test-apps`
- CLI Tool: `/Users/timwray/dev/create-liminalis-app`

## 🐛 Troubleshooting

**Error: "Cannot find module 'liminalis'"**

- Run `npm link` in the library root
- Run `npm link liminalis` in the test project

**Error: "Project already exists"**

- Use a different project name with `--name`
- Or delete the existing project

**Changes not reflecting in test project:**

- Ensure library watch mode is running (`npm run dev`)
- Check if TypeScript is compiling (look for errors in terminal)
- Verify `dist/lib.js` is being updated (check timestamp)
- Restart Vite dev server in test project if needed

**TypeScript errors in test project:**

- Make sure test project has latest library types
- Try `npm link liminalis` again
- Restart TypeScript server in VS Code (Cmd+Shift+P → "TypeScript: Restart TS Server")
