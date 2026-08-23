import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { runDirMode } from './modes/dir.js';
import { runRepoMode } from './modes/repo.js';
import { runUrlMode } from './modes/url.js';
import { runUltraMode } from './modes/ultra.js';
import { generateDesignMd } from './writers/design-md.js';
import { generateSkill } from './writers/skill.js';
import { generateCodexSkill } from './writers/codex-skill.js';
import { codexUserSkillsDirectory, installCodexSkill } from './installers/codex.js';
import { AgentTarget, CLIOptions, DesignProfile } from './types.js';
import {
  VERSION,
  showLogo,
  showMissionBrief,
  startSpinner,
  succeedSpinner,
  failSpinner,
  warnLine,
  showUltraPlaywrightError,
  showResults,
  runInteractivePrompts,
} from './ui.js';

const program = new Command();

program
  .name('skillui')
  .description('Reverse-engineer design systems from any project. Pure static analysis — no AI, no API keys.')
  .version(VERSION)
  .option('--dir <path>', 'Scan a local project directory')
  .option('--repo <url>', 'Clone and scan a git repository')
  .option('--url <url>', 'Crawl a live website')
  .option('--out <path>', 'Output directory', './')
  .option('--name <string>', 'Override project name')
  .option('--no-skill', 'Output DESIGN.md only, skip .skill packaging')
  .option('--format <format>', 'Output format: design-md | skill | both', 'both')
  .option('--mode <mode>', 'Extraction mode: default | ultra', 'default')
  .option('--screens <number>', 'Ultra mode: max pages to crawl (default: 5)', '5')
  .option('--target <target>', 'Output target: claude | codex | both', 'claude')
  .option('--install-to <projectPath>', 'Install the Codex skill into <projectPath>/.agents/skills/')
  .option('--install-user', 'Install the Codex skill into the current user .agents/skills directory')
  .option('--force', 'Replace an existing Codex skill during installation')
  .action(async (opts: CLIOptions) => {
    // Always show the logo on every command
    await showLogo();

    const modes = [opts.dir, opts.repo, opts.url].filter(Boolean);

    if (modes.length === 0) {
      // No args — ask step-by-step questions
      const answers = await runInteractivePrompts();
      if (!answers) process.exit(0);
      opts.url  = answers.source === 'url'  ? answers.target : undefined;
      opts.dir  = answers.source === 'dir'  ? answers.target : undefined;
      opts.repo = answers.source === 'repo' ? answers.target : undefined;
      opts.mode = answers.mode;
      opts.out  = answers.out || './';
      opts.target = answers.targetAgent;
      opts.installTo = answers.installTo;
    } else if (modes.length > 1) {
      console.error('  Error: Specify only one of --dir, --repo, or --url\n');
      process.exit(1);
    }

    // ── Determine target label for brief ──────────────────────────────
    if (!isAgentTarget(opts.target)) failCli('Invalid --target value. Use: claude, codex, or both.');
    if (opts.mode !== 'default' && opts.mode !== 'ultra') failCli('Invalid --mode value. Use: default or ultra.');
    if (!['design-md', 'skill', 'both'].includes(opts.format)) failCli('Invalid --format value. Use: design-md, skill, or both.');
    if (opts.installTo && opts.installUser) failCli('Use either --install-to or --install-user, not both.');
    if ((opts.installTo || opts.installUser || opts.force) && opts.target === 'claude') {
      failCli('Codex installation options require --target codex or --target both.');
    }

    const target = opts.url || opts.dir || opts.repo || '';
    showMissionBrief(opts.mode || 'default', target, path.resolve(opts.out));

    try {
      let profile: DesignProfile;
      let screenshotPath: string | null = null;
      let extractionDir: string | undefined;
      let temporaryExtractionDir: string | undefined;

      const outputDir = path.resolve(opts.out);
      fs.mkdirSync(outputDir, { recursive: true });

      // ── Dir mode ──────────────────────────────────────────────────
      if (opts.dir) {
        const resolvedDir = path.resolve(opts.dir);
        if (!fs.existsSync(resolvedDir)) {
          console.error(`\n  Error: Directory not found: ${resolvedDir}\n`);
          process.exit(1);
        }
        const sp = startSpinner('Scanning local directory...');
        try {
          profile = await runDirMode(resolvedDir, opts.name);
          succeedSpinner(sp, 'Directory scan', `${profile.colors.length} colors · ${profile.components.length} components`);
        } catch (e: any) {
          failSpinner(sp, 'Directory scan', e.message);
          throw e;
        }

      // ── Repo mode ─────────────────────────────────────────────────
      } else if (opts.repo) {
        const sp = startSpinner('Cloning repository...');
        try {
          profile = await runRepoMode(opts.repo, opts.name);
          succeedSpinner(sp, 'Repo clone + scan', `${profile.colors.length} colors · ${profile.components.length} components`);
        } catch (e: any) {
          failSpinner(sp, 'Repo clone', e.message);
          throw e;
        }

      // ── URL mode ──────────────────────────────────────────────────
      } else {
        const safeName = (opts.name || new URL(opts.url!).hostname.replace(/^www\./, '').split('.')[0])
          .replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        extractionDir = opts.target === 'codex'
          ? fs.mkdtempSync(path.join(outputDir, `.skillui-${safeName}-`))
          : path.join(outputDir, `${safeName}-design`);
        if (opts.target === 'codex') temporaryExtractionDir = extractionDir;
        fs.mkdirSync(path.join(extractionDir, 'screenshots'), { recursive: true });

        const sp1 = startSpinner('Fetching HTML + CSS...');
        let urlResult: Awaited<ReturnType<typeof runUrlMode>>;
        try {
          urlResult = await runUrlMode(opts.url!, opts.name, extractionDir);
          const { cssColorCount, cssFontCount, computedColorCount, hadPlaywright } = urlResult;
          const detail = hadPlaywright
            ? `${cssColorCount} CSS colors · ${computedColorCount} computed · ${cssFontCount} fonts`
            : `${cssColorCount} colors · ${cssFontCount} fonts (Playwright not found)`;
          succeedSpinner(sp1, 'CSS + token extraction', detail);
          if (!hadPlaywright) {
            warnLine('Playwright not installed — computed style extraction skipped');
            warnLine('Fix: npm install -g playwright && npx playwright install chromium');
          }
        } catch (e: any) {
          failSpinner(sp1, 'CSS + token extraction', e.message);
          throw e;
        }
        profile = urlResult.profile;
        screenshotPath = urlResult.screenshotPath;
      }

      // ── Ultra mode (URL only) ──────────────────────────────────────
      const isUltra = opts.mode === 'ultra' && !!opts.url;
      let ultraAnimations: import('./types-ultra.js').FullAnimationResult | null = null;

      if (isUltra) {
        const ultraScreens = Math.max(1, Math.min(20, parseInt(opts.screens, 10) || 5));
        const skillDir = extractionDir || path.join(outputDir, `${profile.projectName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()}-design`);

        // Check playwright before spinning up ultra
        const { loadPlaywright } = await import('./playwright-loader.js');
        if (!loadPlaywright()) {
          showUltraPlaywrightError();
          warnLine('Continuing without ultra features...');
        } else {
          const spAnim = startSpinner('Capturing scroll journey + animations...');
          try {
            const ultraResult = await runUltraMode(opts.url!, profile, skillDir, { screens: ultraScreens });
            ultraAnimations = ultraResult.animations;
            const kf = ultraAnimations.keyframes.length;
            const sf = ultraAnimations.scrollFrames.length;
            const libs = ultraAnimations.libraries.map(l => l.name).join(', ') || 'none';
            succeedSpinner(spAnim, 'Ultra extraction', `${sf} scroll frames · ${kf} keyframes · ${libs}`);
          } catch (e: any) {
            failSpinner(spAnim, 'Ultra extraction', e.message);
            throw e;
          }
        }
      }

      // ── Generate + write outputs ───────────────────────────────────
      const shouldWriteClaude = opts.target === 'claude' || opts.target === 'both';
      const shouldWriteDesignMd = shouldWriteClaude && (opts.format === 'design-md' || opts.format === 'both');
      const shouldWriteSkill = shouldWriteClaude && opts.skill !== false && (opts.format === 'skill' || opts.format === 'both');

      const designMdContent = generateDesignMd(profile, screenshotPath);
      const safeName = profile.projectName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
      const designDir = path.join(outputDir, `${safeName}-design`);
      if (shouldWriteClaude) fs.mkdirSync(designDir, { recursive: true });

      let designMdPath: string | undefined;
      if (shouldWriteDesignMd) {
        const spWrite = startSpinner('Writing DESIGN.md...');
        designMdPath = path.join(designDir, 'DESIGN.md');
        fs.writeFileSync(designMdPath, designMdContent, 'utf-8');
        succeedSpinner(spWrite, 'DESIGN.md', designMdPath);
      }

      let skillFilePath: string | undefined;
      let skillInstalled = false;
      if (shouldWriteSkill) {
        const spSkill = startSpinner('Bundling .skill package...');
        try {
          const result = await generateSkill(profile, designMdContent, path.resolve(opts.out), screenshotPath, ultraAnimations);
          skillFilePath = result.skillFile;
          succeedSpinner(spSkill, '.skill package', skillFilePath);

          // ── Auto-install to ~/.claude/skills/ + write CLAUDE.md ──
          // Use the actual skillDir folder name (e.g. "ascend-design") as the skill name
          const skillFolderName = path.basename(result.skillDir);
          skillInstalled = installSkillForClaude(result.skillDir, skillFolderName);
          writeClaludeMd(result.skillDir, skillFolderName, profile.projectName);
        } catch (e: any) {
          failSpinner(spSkill, '.skill package', e.message);
          throw e;
        }
      }

      // ── Show results panel ─────────────────────────────────────────
      let codexSkillDir: string | undefined;
      let codexInstallPath: string | undefined;
      let codexSkillName: string | undefined;
      if (opts.target === 'codex' || opts.target === 'both') {
        const spCodex = startSpinner('Creating native Codex skill...');
        try {
          const source = opts.url
            ? { type: 'url' as const, value: opts.url, mode: opts.mode }
            : opts.repo
              ? { type: 'repository' as const, value: opts.repo, mode: opts.mode }
              : { type: 'local-directory' as const, mode: opts.mode };
          const result = await generateCodexSkill(profile, outputDir, source, extractionDir);
          codexSkillDir = result.skillDir;
          codexSkillName = result.skillName;
          succeedSpinner(spCodex, 'Codex skill', codexSkillDir);

          if (opts.installTo) {
            codexInstallPath = installCodexSkill(codexSkillDir, opts.installTo, result.skillName, !!opts.force);
          } else if (opts.installUser) {
            const userSkills = codexUserSkillsDirectory();
            if (!userSkills) throw new Error('Unable to determine the current user skill directory.');
            fs.mkdirSync(userSkills, { recursive: true });
            codexInstallPath = installCodexSkill(codexSkillDir, path.dirname(path.dirname(userSkills)), result.skillName, !!opts.force);
          }
        } catch (e: any) {
          failSpinner(spCodex, 'Codex skill', e.message);
          throw e;
        }
      }

      if (temporaryExtractionDir) fs.rmSync(temporaryExtractionDir, { recursive: true, force: true });

      showResults({
        profile,
        animations: ultraAnimations ?? undefined,
        skillFilePath,
        designMdPath,
        projectName: safeName,
        skillInstalled,
        target: opts.target,
        codexSkillDir,
        codexInstallPath,
        codexSkillName,
      });

    } catch (err: any) {
      console.error(`\n  Error: ${err.message || err}\n`);
      process.exit(1);
    }
  });

program.parse();

function isAgentTarget(value: string): value is AgentTarget {
  return value === 'claude' || value === 'codex' || value === 'both';
}

function failCli(message: string): never {
  console.error(`\n  Error: ${message}\n`);
  process.exit(1);
}

// ── Write CLAUDE.md into the design folder so Claude Code picks it up ────
function writeClaludeMd(skillDir: string, safeName: string, projectName: string): void {
  try {
    const claudeMdPath = path.join(skillDir, 'CLAUDE.md');
    // Don't overwrite if one already exists
    if (fs.existsSync(claudeMdPath)) return;
    const content = `# ${projectName} Design System

This project uses the **${projectName}** design system extracted by skillui.

## How to use

Read \`SKILL.md\` in this directory for the full design system reference before writing any UI code.

Key files:
- \`SKILL.md\` — master design reference (read this first)
- \`references/DESIGN.md\` — extended tokens and component specs
- \`references/ANIMATIONS.md\` — motion and keyframe specs
- \`references/LAYOUT.md\` — grid and layout containers
- \`references/COMPONENTS.md\` — DOM component patterns
- \`screens/scroll/\` — scroll journey screenshots (study before implementing)

When building any UI, always read SKILL.md first and match colors, fonts, spacing, and motion exactly.
`;
    fs.writeFileSync(claudeMdPath, content, 'utf-8');
  } catch { /* non-fatal */ }
}

// ── Auto-install skill to ~/.claude/skills/<name>/SKILL.md ───────────────
// Claude Code requires each skill to be a FOLDER with SKILL.md inside it.
function installSkillForClaude(skillDir: string, safeName: string): boolean {
  try {
    const skillMdSrc = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMdSrc)) return false;

    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    if (!homeDir) return false;

    // ~/.claude/skills/<safeName>/SKILL.md  ← correct structure for /skills
    const destDir = path.join(homeDir, '.claude', 'skills', safeName);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(skillMdSrc, path.join(destDir, 'SKILL.md'));

    return true;
  } catch {
    return false;
  }
}
