#!/usr/bin/env node

import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, symlinkSync, unlinkSync, readFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { parse as parseYaml } from "yaml";

// ─── Constants ───────────────────────────────────────────────────────────────

const REGISTRY_URL =
  "https://raw.githubusercontent.com/0xHoneyJar/constructs-cli/main/registry.yaml";

const CONSTRUCTS_DIR = ".claude/constructs/packs";
const COMMANDS_DIR = ".claude/commands";

const VERSION = "0.1.0";

// ─── Colors (no dependency) ──────────────────────────────────────────────────

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

// ─── Registry ────────────────────────────────────────────────────────────────

interface Construct {
  git_url: string;
  description?: string;
  category?: string;
  author?: string;
}

interface Registry {
  version: number;
  constructs: Record<string, Construct>;
}

async function fetchRegistry(): Promise<Registry> {
  try {
    const response = await fetch(REGISTRY_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    return parseYaml(text) as Registry;
  } catch (error) {
    console.error(red("✗ Failed to fetch construct registry"));
    console.error(dim("  Check your network connection."));
    console.error(dim(`  Registry: ${REGISTRY_URL}`));
    process.exit(1);
  }
}

// ─── Symlink Commands ────────────────────────────────────────────────────────

function symlinkCommands(slug: string, packDir: string): number {
  const commandsSource = join(packDir, "commands");
  if (!existsSync(commandsSource)) return 0;

  mkdirSync(COMMANDS_DIR, { recursive: true });
  let linked = 0;

  for (const file of readdirSync(commandsSource)) {
    if (!file.endsWith(".md")) continue;
    const target = join(COMMANDS_DIR, file);
    const source = `../constructs/packs/${slug}/commands/${file}`;

    // Remove existing symlink
    try {
      if (existsSync(target)) unlinkSync(target);
    } catch {}

    try {
      symlinkSync(source, target);
      linked++;
    } catch {}
  }
  return linked;
}

function unlinkCommands(slug: string, packDir: string): void {
  const commandsSource = join(packDir, "commands");
  if (!existsSync(commandsSource)) return;
  if (!existsSync(COMMANDS_DIR)) return;

  for (const file of readdirSync(commandsSource)) {
    if (!file.endsWith(".md")) continue;
    const target = join(COMMANDS_DIR, file);
    try {
      if (existsSync(target)) unlinkSync(target);
    } catch {}
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function install(slug: string) {
  const registry = await fetchRegistry();
  const construct = registry.constructs[slug];

  if (!construct) {
    console.error(red(`✗ Construct "${slug}" not found`));
    console.error(dim("  Run: constructs-cli list"));
    process.exit(1);
  }

  const targetDir = join(CONSTRUCTS_DIR, slug);

  if (existsSync(targetDir)) {
    console.error(yellow(`⚠ ${slug} is already installed at ${targetDir}`));
    console.error(dim("  Run: constructs-cli update " + slug));
    process.exit(1);
  }

  // Ensure parent dirs exist
  mkdirSync(CONSTRUCTS_DIR, { recursive: true });

  console.log(`${cyan("↓")} Installing ${bold(slug)}...`);

  try {
    execSync(`git clone --depth 1 ${construct.git_url} ${targetDir}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error: any) {
    console.error(red(`✗ Failed to clone ${construct.git_url}`));
    console.error(dim("  Check the repository URL and your network connection."));
    // Clean up partial clone
    try { rmSync(targetDir, { recursive: true, force: true }); } catch {}
    process.exit(1);
  }

  // Remove .git directory — installed, not submoduled
  try {
    rmSync(join(targetDir, ".git"), { recursive: true, force: true });
  } catch {}

  // Run post-install script if exists
  const installScript = join(targetDir, "scripts", "install.sh");
  if (existsSync(installScript)) {
    try {
      execSync(`bash ${installScript}`, {
        cwd: targetDir,
        stdio: "inherit",
      });
    } catch {
      console.log(yellow("  ⚠ Post-install script had warnings (non-fatal)"));
    }
  }

  // Symlink commands
  const linked = symlinkCommands(slug, targetDir);

  console.log(green(`✓ Installed ${bold(slug)}`));
  if (linked > 0) {
    console.log(dim(`  ${linked} command${linked > 1 ? "s" : ""} linked to ${COMMANDS_DIR}/`));
  }

  // Show quick start hint from construct.yaml or CLAUDE.md
  const constructYaml = join(targetDir, "construct.yaml");
  if (existsSync(constructYaml)) {
    try {
      const content = readFileSync(constructYaml, "utf-8");
      const data = parseYaml(content);
      if (data?.quick_start?.command) {
        console.log(dim(`  Quick start: ${data.quick_start.command}`));
      }
    } catch {}
  }
}

async function list() {
  const registry = await fetchRegistry();
  const constructs = registry.constructs;
  const slugs = Object.keys(constructs).sort();

  console.log(bold(`\nConstructs Registry — ${slugs.length} public constructs\n`));

  // Group by category
  const categories: Record<string, string[]> = {};
  for (const slug of slugs) {
    const cat = constructs[slug].category || "other";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(slug);
  }

  for (const cat of Object.keys(categories).sort()) {
    console.log(cyan(`  ${cat}`));
    for (const slug of categories[cat]) {
      const c = constructs[slug];
      const installed = existsSync(join(CONSTRUCTS_DIR, slug));
      const marker = installed ? green("●") : dim("○");
      const desc = c.description || "";
      console.log(`    ${marker} ${bold(slug.padEnd(20))} ${dim(desc)}`);
    }
    console.log();
  }

  console.log(dim(`Install: npx constructs-cli install <name>`));
  console.log(dim(`● = installed   ○ = available\n`));
}

async function info(slug: string) {
  const registry = await fetchRegistry();
  const construct = registry.constructs[slug];

  if (!construct) {
    console.error(red(`✗ Construct "${slug}" not found`));
    process.exit(1);
  }

  const installed = existsSync(join(CONSTRUCTS_DIR, slug));

  console.log();
  console.log(bold(slug));
  console.log(dim("─".repeat(40)));
  if (construct.description) console.log(`  ${construct.description}`);
  if (construct.category) console.log(`  Category: ${cyan(construct.category)}`);
  if (construct.author) console.log(`  Author:   ${construct.author}`);
  console.log(`  Repo:     ${dim(construct.git_url)}`);
  console.log(`  Status:   ${installed ? green("installed") : dim("not installed")}`);
  console.log();

  if (!installed) {
    console.log(dim(`  Install: npx constructs-cli install ${slug}`));
  }
}

async function update(slug: string) {
  const targetDir = join(CONSTRUCTS_DIR, slug);

  if (!existsSync(targetDir)) {
    console.error(red(`✗ ${slug} is not installed`));
    console.error(dim("  Run: constructs-cli install " + slug));
    process.exit(1);
  }

  // Remove and reinstall
  console.log(`${cyan("↻")} Updating ${bold(slug)}...`);
  unlinkCommands(slug, targetDir);
  rmSync(targetDir, { recursive: true, force: true });
  await install(slug);
}

function remove(slug: string) {
  const targetDir = join(CONSTRUCTS_DIR, slug);

  if (!existsSync(targetDir)) {
    console.error(red(`✗ ${slug} is not installed`));
    process.exit(1);
  }

  unlinkCommands(slug, targetDir);
  rmSync(targetDir, { recursive: true, force: true });
  console.log(green(`✓ Removed ${bold(slug)}`));
}

function help() {
  console.log(`
${bold("constructs-cli")} v${VERSION} — AI expertise packs for Claude Code

${bold("Usage:")}
  constructs-cli install <name>   Install a construct
  constructs-cli list             List available constructs
  constructs-cli info <name>      Show construct details
  constructs-cli update <name>    Update an installed construct
  constructs-cli remove <name>    Remove a construct
  constructs-cli help             Show this help

${bold("Examples:")}
  npx constructs-cli install k-hole      ${dim("# deep research")}
  npx constructs-cli install artisan     ${dim("# UI craft")}
  npx constructs-cli install protocol    ${dim("# smart contracts")}
  npx constructs-cli list                ${dim("# see all available")}

${dim("No account needed. All public constructs are free.")}
${dim("https://constructs.network")}
`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

// ─── Deprecation pointer (the fold, loa-constructs cycle constructs-launcher-cli) ───
//
// This tool is superseded by the `constructs` capability binary in
// 0xHoneyJar/loa-constructs (packages/constructs-cli): zero runtime deps,
// deterministic JSON on stdout, an exit-code dictionary, capabilities/robot-docs
// self-description, and discoverability through the `loa` launcher.
//
// Behavior here is UNCHANGED — the pointer goes to stderr and every command still
// runs. This repo's git-native, no-auth install lane lives on as the offline rung
// of the new binary's source-of-truth ladder (it was absorbed, not deleted).
//
// Silence: CONSTRUCTS_SILENCE_DEPRECATION=1
if (!process.env.CONSTRUCTS_SILENCE_DEPRECATION) {
  console.error(
    "note: constructs-cli is superseded by the `constructs` capability binary in 0xHoneyJar/loa-constructs (packages/constructs-cli). This tool still works; the new one is agent-first (deterministic JSON, exit-code dictionary, `constructs robot-docs guide`). Silence with CONSTRUCTS_SILENCE_DEPRECATION=1."
  );
}

const args = process.argv.slice(2);
const command = args[0];
const target = args[1];

switch (command) {
  case "install":
  case "i":
    if (!target) {
      console.error(red("✗ Missing construct name"));
      console.error(dim("  Usage: constructs-cli install <name>"));
      process.exit(1);
    }
    install(target);
    break;
  case "list":
  case "ls":
    list();
    break;
  case "info":
    if (!target) {
      console.error(red("✗ Missing construct name"));
      process.exit(1);
    }
    info(target);
    break;
  case "update":
  case "up":
    if (!target) {
      console.error(red("✗ Missing construct name"));
      process.exit(1);
    }
    update(target);
    break;
  case "remove":
  case "rm":
    if (!target) {
      console.error(red("✗ Missing construct name"));
      process.exit(1);
    }
    remove(target);
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    help();
    break;
  case "--version":
  case "-v":
    console.log(VERSION);
    break;
  default:
    console.error(red(`✗ Unknown command: ${command}`));
    help();
    process.exit(1);
}
