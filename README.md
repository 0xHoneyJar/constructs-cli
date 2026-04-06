# constructs-cli

Install AI expertise packs for Claude Code. No account needed.

## Usage

```bash
# Install a construct
npx constructs-cli install k-hole      # deep research
npx constructs-cli install artisan     # UI craft
npx constructs-cli install protocol    # smart contracts

# See all available
npx constructs-cli list

# More commands
npx constructs-cli info k-hole
npx constructs-cli update k-hole
npx constructs-cli remove k-hole
```

## What are Constructs?

Constructs are AI expertise packs — deep knowledge about specific domains, packaged as markdown files that Claude Code can read. Each construct includes:

- **CLAUDE.md** — Project context for the AI
- **skills/** — Domain-specific skill definitions
- **commands/** — Slash commands (e.g., `/dig`, `/forge`)
- **identity/** — Persona and expertise definitions

## No Account Needed

All public constructs are free and open source. Installation is a `git clone` under the hood — no API, no database, no authentication.

## Manual Install (no npm needed)

```bash
git clone https://github.com/0xHoneyJar/construct-k-hole .claude/constructs/packs/k-hole
```

## Adding a Construct to the Registry

1. Create a repository with the [construct format](https://github.com/0xHoneyJar/construct-base)
2. PR to [registry.yaml](https://github.com/0xHoneyJar/loa-constructs/blob/main/registry.yaml)

## Loa Runtime (optional)

[Loa](https://github.com/0xHoneyJar/loa) is an agent development framework that adds cross-construct composition, mode detection, and persistent memory. Constructs work without Loa, but Loa makes them compose.

```bash
curl -fsSL https://raw.githubusercontent.com/0xHoneyJar/loa/main/.claude/scripts/mount-loa.sh | bash
```

## License

MIT
