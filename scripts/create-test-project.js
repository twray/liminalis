#!/usr/bin/env node

/**
 * Automated test project creation script for Liminalis library development
 *
 * Usage:
 *   node scripts/create-test-project.js
 *   node scripts/create-test-project.js --name my-test --template animated-circles
 *   node scripts/create-test-project.js --skip-install --skip-link
 */

import { spawn } from "child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { dirname, extname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (flag, defaultValue) => {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
};
const hasFlag = (flag) => args.includes(flag);

const projectName = getArg("--name", `test-${Date.now()}`);
const template = getArg("--template", "default");
const skipInstall = hasFlag("--skip-install");
const skipLink = hasFlag("--skip-link");
const skipDev = hasFlag("--skip-dev");

const LIMINALIS_DIR = resolve(__dirname, "..");
const TEST_APPS_DIR = resolve(LIMINALIS_DIR, "test-apps");
const PROJECT_DIR = resolve(TEST_APPS_DIR, projectName);

console.log("\n🔧 Liminalis Test Project Setup\n");
console.log(`📦 Project name: ${projectName}`);
console.log(`🎨 Template: ${template}`);
console.log(`📁 Location: ${PROJECT_DIR}\n`);

// Ensure test-apps directory exists
if (!existsSync(TEST_APPS_DIR)) {
  console.log("📁 Creating test-apps directory...");
  mkdirSync(TEST_APPS_DIR, { recursive: true });
}

// Check if project already exists
if (existsSync(PROJECT_DIR)) {
  console.error(`❌ Project directory already exists: ${PROJECT_DIR}`);
  console.log("💡 Use a different name or delete the existing directory\n");
  process.exit(1);
}

// Function to run command with live output
function runCommand(command, args, cwd, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️  ${description}...`);
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`✅ ${description} - Done\n`);
        resolve();
      } else {
        console.error(`❌ ${description} - Failed with code ${code}\n`);
        reject(new Error(`${description} failed`));
      }
    });
  });
}

function collectSourceFiles(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  entries.forEach((entry) => {
    const entryPath = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      return;
    }

    const extension = extname(entry.name);
    if ([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"].includes(extension)) {
      files.push(entryPath);
    }
  });

  return files;
}

function patchLegacyCreateVisualisationUsage(projectDir) {
  const srcDir = resolve(projectDir, "src");
  if (!existsSync(srcDir)) {
    console.log(
      "ℹ️  No src directory found, skipping API compatibility patch\n",
    );
    return;
  }

  const legacyApiPattern = /\bcreateVisualisation\b|\bcreateVisualization\b/g;
  const sourceFiles = collectSourceFiles(srcDir);
  let filesPatched = 0;
  let referencesPatched = 0;

  sourceFiles.forEach((filePath) => {
    const source = readFileSync(filePath, "utf8");
    const matches = source.match(legacyApiPattern);
    if (!matches) {
      return;
    }

    const patchedSource = source.replace(legacyApiPattern, "createScene");
    writeFileSync(filePath, patchedSource, "utf8");

    filesPatched += 1;
    referencesPatched += matches.length;
    console.log(`🩹 Updated deprecated API references in ${filePath}`);
  });

  if (filesPatched === 0) {
    console.log("✅ Scaffolded source already uses createScene\n");
    return;
  }

  console.log(
    `✅ Patched ${referencesPatched} deprecated API reference(s) across ${filesPatched} file(s)\n`,
  );
}

// Main execution
(async () => {
  try {
    // Step 1: Build library if needed
    console.log("🔨 Checking if library needs to be built...");
    const distExists = existsSync(resolve(LIMINALIS_DIR, "dist", "lib.js"));
    if (!distExists) {
      await runCommand(
        "npm",
        ["run", "build"],
        LIMINALIS_DIR,
        "Building library",
      );
    } else {
      console.log("✅ Library already built\n");
    }

    // Step 2: Link library globally
    if (!skipLink) {
      await runCommand(
        "npm",
        ["link"],
        LIMINALIS_DIR,
        "Linking library globally",
      );
    }

    // Step 3: Create project using CLI
    console.log(`\n▶️  Creating project with create-liminalis-app...`);
    const createArgs =
      template === "default"
        ? [projectName]
        : [projectName, "--template", template];

    await runCommand(
      "npx",
      ["create-liminalis-app", ...createArgs],
      TEST_APPS_DIR,
      "Creating project",
    );

    // Step 3.5: Patch outdated API names from older scaffold versions
    patchLegacyCreateVisualisationUsage(PROJECT_DIR);

    // Step 4: Link local library to project
    if (!skipLink) {
      await runCommand(
        "npm",
        ["link", "liminalis"],
        PROJECT_DIR,
        "Linking local library",
      );
    }

    // Step 5: Install dependencies
    if (!skipInstall) {
      await runCommand(
        "npm",
        ["install"],
        PROJECT_DIR,
        "Installing dependencies",
      );
    }

    // Success message
    console.log("\n✨ Test project created successfully!\n");
    console.log("📍 Project location:");
    console.log(`   ${PROJECT_DIR}\n`);
    console.log("🚀 Next steps:\n");
    console.log(`   cd ${PROJECT_DIR}`);
    if (skipInstall) console.log("   npm install");
    if (skipLink) console.log("   npm link liminalis");
    console.log("   npm run dev\n");

    // Step 6: Start dev server
    if (!skipDev) {
      console.log("🌐 Starting development server...\n");
      await runCommand(
        "npm",
        ["run", "dev"],
        PROJECT_DIR,
        "Starting dev server",
      );
    }
  } catch (error) {
    console.error("\n❌ Setup failed:", error.message);
    process.exit(1);
  }
})();
