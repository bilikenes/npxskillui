<div align="center">
  <a href="https://skillui.vercel.app">
    <img src="skillui.png" alt="SkillUI" width="620" />
  </a>
  <br /><br />
  <p><strong>Reverse-engineer any design system into a native Codex skill.<br/>Deterministic extraction. No AI inference. No LLM API calls.</strong></p>

  [![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org)
  [![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](https://github.com/bilikenes/npxskillui)
  [![GitHub repo](https://img.shields.io/badge/source-npxskillui-gray?style=flat-square&logo=github)](https://github.com/bilikenes/npxskillui)

</div>

---

## What is SkillUI?

**SkillUI** is a CLI that inspects a live website, public Git repository, or local frontend project and turns its visual language into a reusable design-system skill for OpenAI Codex.

It extracts colors, typography, spacing, CSS variables, components, responsive rules, animations, interaction states, layout patterns, screenshots, and font sources. The result is a portable Codex skill with progressive-disclosure references, structured token files, and visual assets.

SkillUI does not copy a source site's business logic or content. The generated skill tells Codex how to carry over the visual language while preserving the target application's routes, data, behavior, and functionality.

> **Distribution note:** This Codex-compatible version is currently available in this GitHub repository. It has not yet been published as the general `skillui` npm package, so install it from source using the steps below.

## Installation from GitHub

```bash
git clone https://github.com/bilikenes/npxskillui.git
cd npxskillui
npm install
npm run build
npm link
```

`npm link` makes the locally built CLI available as the `skillui` command. If you do not want to link it globally, use `node dist/cli.js` instead.

Requires **Node.js 18 or newer**.

For the optional `ultra` mode, install Playwright and its Chromium browser:

```bash
npx playwright install chromium
```

## Quick start with Codex

The most convenient workflow is to extract a design system and install it directly into an existing project:

```bash
skillui --url https://linear.app --mode ultra --target codex --install-to ../my-dashboard
cd ../my-dashboard
codex
```

The command creates:

```text
../my-dashboard/.agents/skills/linear-design/
```

Start Codex in `my-dashboard` and prompt it with the generated skill:

```text
Use $linear-design to adapt the current frontend to the extracted Linear design language.

Preserve existing functionality, routes, content, data flow, business logic, and API behavior.
Change the visual system: typography, spacing, colors, surfaces, components, layout,
responsive behavior, interaction states, and motion.
```

To create a portable skill without installing it, omit `--install-to`:

```bash
skillui --url https://linear.app --mode ultra --target codex --out ./design-systems
```

This produces `./design-systems/linear-codex-skill/`. Copy its contents to a target project's `.agents/skills/linear-design/` directory, or use `--install-to` on the next run.

## Input modes

### URL mode

Fetches a live website and its linked stylesheets. The default mode works without Playwright; when Playwright is available, computed styles are also inspected and merged into the result.

```bash
skillui --url https://linear.app --target codex
```

### Ultra mode

Adds browser-based visual extraction for a URL: full-page and section screenshots, scroll-journey frames, hover/focus states, animation and keyframe detection, layout extraction, and DOM component fingerprints.

```bash
skillui --url https://linear.app --mode ultra --target codex
```

Ultra mode is URL-only. If Playwright is unavailable, SkillUI keeps the token extraction and skips the browser-only features.

### Local directory mode

Scans a local frontend project for CSS/SCSS, JavaScript/TypeScript, JSX/TSX, Tailwind configuration, CSS variables, token files, and component patterns.

```bash
skillui --dir ./my-app --target codex
```

### Repository mode

Shallow-clones a public Git repository into a temporary directory and runs the local directory analysis.

```bash
skillui --repo https://github.com/org/repo --target codex
```

## Extraction modes at a glance

| Capability | Default | Ultra |
|---|:---:|:---:|
| Colors, typography, spacing, shadows, and radii | Yes | Yes |
| CSS variables and framework tokens | Yes | Yes |
| Component and library detection | Yes | Yes |
| Codex `SKILL.md` and progressive references | Yes | Yes |
| Structured JSON token files | Yes | Yes |
| Homepage screenshot for URL sources | Best effort | Yes |
| Full-page and section screenshots | | Yes |
| Scroll-journey screenshots | | Yes |
| Hover/focus interaction diffs | | Yes |
| CSS keyframes and animation-library detection | | Yes |
| Flex/grid layout extraction | | Yes |
| DOM component fingerprinting | | Yes |

## Codex skill output

For a source named `linear`, the native Codex artifact looks like this:

```text
linear-codex-skill/
|-- SKILL.md                    # Skill instructions and YAML frontmatter
|-- agents/
|   `-- openai.yaml             # Codex display metadata and default prompt
|-- references/
|   |-- DESIGN.md               # Colors, typography, spacing, surfaces, and rules
|   |-- SOURCE.md               # Source, mode, timestamp, and capture metadata
|   |-- ANIMATIONS.md           # Ultra mode: motion and keyframes
|   |-- COMPONENTS.md           # Ultra mode: DOM component patterns
|   |-- INTERACTIONS.md         # Ultra mode: hover/focus state diffs
|   |-- LAYOUT.md               # Ultra mode: layout and grid relationships
|   `-- VISUAL_GUIDE.md         # Ultra mode: screenshot-based visual reference
|-- tokens/
|   |-- colors.json
|   |-- spacing.json
|   `-- typography.json
|-- assets/
|   |-- screens/                 # Ultra screenshots and screenshot index
|   |-- screenshots/             # URL homepage screenshots, when available
|   `-- ...
`-- fonts/                       # Downloaded font files, when available
```

The ultra-only references and visual folders are omitted when no corresponding data is available. `SKILL.md` uses progressive disclosure: Codex reads the core design reference first and opens detailed references only when the task needs them.

## Installing a generated Codex skill

Install into an existing project with:

```bash
skillui --url https://stripe.com --target codex --install-to ../checkout-app
```

This installs the complete skill at:

```text
../checkout-app/.agents/skills/stripe-design/
```

Install for the current user instead with:

```bash
skillui --url https://stripe.com --target codex --install-user
```

The user-level destination is `<user-home>/.agents/skills/<skill-name>/`. Existing skills are protected. Add `--force` only when you intentionally want to replace an existing generated skill.

SkillUI does not modify the target project's `AGENTS.md` file.

## Targets

`--target` controls which agent artifact is generated:

| Target | Output |
|---|---|
| `codex` | Native Codex skill in `<name>-codex-skill/` |
| `claude` | Legacy Claude Code `DESIGN.md`, `SKILL.md`, `CLAUDE.md`, and `.skill` output |
| `both` | Independent Codex and Claude Code artifacts |

The CLI default remains `claude` for backwards compatibility. Add `--target codex` explicitly when the output is intended for Codex.

When `--target codex` or `--target both` is selected, the Codex artifact is generated even if `--format` or `--no-skill` is used; those options control the legacy Claude output.

## All CLI flags

```text
skillui --url <url>             Crawl a live website
skillui --dir <path>            Scan a local project directory
skillui --repo <url>            Clone and scan a Git repository

--target codex|claude|both       Output target (default: claude)
--mode default|ultra             Extraction mode (default: default)
--screens <n>                    Ultra pages to crawl (default: 5, max: 20)
--out <path>                     Output directory (default: ./)
--name <string>                  Override the generated project/skill name

--install-to <projectPath>       Install Codex skill into <projectPath>/.agents/skills/
--install-user                   Install Codex skill into the current user's .agents/skills/
--force                          Replace an existing Codex skill during installation

--format design-md|skill|both    Legacy Claude output format (default: both)
--no-skill                       Legacy Claude output: skip .skill packaging
```

Only one of `--url`, `--dir`, or `--repo` may be provided per run.

## Examples

```bash
# Extract a site's design language into a native Codex skill
skillui --url https://nothing.tech --target codex

# Full browser-assisted extraction
skillui --url https://linear.app --mode ultra --screens 10 --target codex

# Scan a local Next.js or React application
skillui --dir ./my-nextjs-app --name MyApp --target codex

# Clone and analyze a public repository
skillui --repo https://github.com/vercel/next.js --name Next.js --target codex

# Generate both agent formats
skillui --url https://stripe.com --target both

# Install directly into a target project and replace an existing skill
skillui --url https://stripe.com --target codex --install-to ../checkout-app --force
```

## How it works

SkillUI performs deterministic extraction and document generation locally:

- **URL mode** fetches HTML and linked CSS, extracts tokens, optionally inspects computed browser styles, and attempts a homepage screenshot.
- **Directory mode** detects frameworks and UI libraries, scans source files and token configuration, and fingerprints reusable components.
- **Repository mode** shallow-clones the repository, scans it, and removes the temporary clone afterward.
- **Ultra mode** uses Playwright to inspect the rendered page, capture visual states, detect motion, and document layout and interactions.
- **Codex packaging** normalizes the result into a skill with a `SKILL.md`, `agents/openai.yaml`, focused references, raw JSON tokens, screenshots, and bundled fonts when available.

No LLM is used to interpret the source. Network access is required for live URLs and repositories; optional screenshot and font downloads also require network access.

## Requirements

- Node.js 18+
- Git, when using `--repo`
- Playwright and Chromium, when using the full `--mode ultra` browser extraction
- Network access, when analyzing a URL, cloning a repository, or downloading remote assets/fonts

## Running without `npm link`

```bash
node dist/cli.js --url https://linear.app --target codex --out ./design-systems
```

The package entry point is `dist/cli.js`; run `npm run build` again after changing the source code.

## Package information

| | |
|---|---|
| **Distribution** | GitHub repository; npm publication is not available yet |
| **Local package name** | `skillui` |
| **Version** | Managed in [`package.json`](package.json) |
| **License** | MIT |
| **Source** | [github.com/bilikenes/npxskillui](https://github.com/bilikenes/npxskillui) |
| **Issues** | [GitHub Issues](https://github.com/bilikenes/npxskillui/issues) |

## License

MIT - built by [Amaan](https://github.com/amaancoderx).
