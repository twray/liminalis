#!/usr/bin/env node

/**
 * Test all create-liminalis-app templates against the current library
 * Creates a project for each template to validate compatibility
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LIMINALIS_DIR = resolve(__dirname, "..");
const TEST_APPS_DIR = resolve(LIMINALIS_DIR, "test-apps");
const TEMPLATES = ["default", "animated-circles", "midi-piano"];

console.log("\n🧪 Testing All Templates\n");
console.log(`Testing ${TEMPLATES.length} templates...\n`);

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
  });
}

(async () => {
  const results = [];

  for (const template of TEMPLATES) {
    const projectName = `test-template-${template}`;
    const projectDir = resolve(TEST_APPS_DIR, projectName);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📋 Testing template: ${template}`);
    console.log(`${"=".repeat(60)}\n`);

    try {
      // Skip if already exists
      if (existsSync(projectDir)) {
        console.log(`⚠️  Project already exists, skipping: ${projectName}\n`);
        results.push({ template, status: "skipped", error: "Already exists" });
        continue;
      }

      // Create project
      await runCommand(
        "node",
        [
          resolve(__dirname, "create-test-project.js"),
          "--name",
          projectName,
          "--template",
          template,
          "--skip-dev",
        ],
        __dirname
      );

      results.push({ template, status: "success" });
      console.log(`✅ ${template} - Success\n`);
    } catch (error) {
      results.push({ template, status: "failed", error: error.message });
      console.error(`❌ ${template} - Failed: ${error.message}\n`);
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Summary");
  console.log("=".repeat(60) + "\n");

  results.forEach(({ template, status, error }) => {
    const icon =
      status === "success" ? "✅" : status === "skipped" ? "⏭️" : "❌";
    console.log(`${icon} ${template.padEnd(20)} ${status.toUpperCase()}`);
    if (error) console.log(`   ${error}`);
  });

  const successCount = results.filter((r) => r.status === "success").length;
  const failCount = results.filter((r) => r.status === "failed").length;

  console.log(`\n📈 Results: ${successCount} succeeded, ${failCount} failed\n`);

  if (failCount > 0) {
    process.exit(1);
  }
})();
