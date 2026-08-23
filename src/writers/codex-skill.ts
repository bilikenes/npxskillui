import * as fs from 'fs';
import * as path from 'path';
import { bundleFonts } from '../font-resolver';
import { DesignProfile } from '../types';
import { generateDesignMd } from './design-md';
import { writeTokensJson } from './tokens-json';

export interface CodexSource {
  type: 'url' | 'repository' | 'local-directory';
  value?: string;
  mode: 'default' | 'ultra';
}

export interface CodexSkillResult {
  skillDir: string;
  skillName: string;
}

/**
 * Creates a native Codex skill. Extraction artifacts are copied from an optional
 * working directory, but the Codex package has its own progressive-disclosure layout.
 */
export async function generateCodexSkill(
  profile: DesignProfile,
  outputDir: string,
  source: CodexSource,
  workingDir?: string
): Promise<CodexSkillResult> {
  const skillName = normalizeCodexSkillName(profile.projectName);
  const skillDir = path.join(outputDir, `${skillName.replace(/-design$/, '')}-codex-skill`);
  fs.rmSync(skillDir, { recursive: true, force: true });
  fs.mkdirSync(skillDir, { recursive: true });

  copyVisualArtifacts(workingDir, skillDir);
  copyUsefulReferences(workingDir, skillDir);

  const fontFamilies = profile.typography.map(token => token.fontFamily).filter(Boolean);
  let profileWithFonts = profile;
  if (fontFamilies.length > 0 || profile.fontSources.length > 0) {
    const weights = new Set(profile.typography.map(token => String(token.fontWeight || '400')));
    const result = await bundleFonts(profile.fontSources, fontFamilies, skillDir, weights);
    profileWithFonts = { ...profile, fontSources: result.updatedSources };
  }

  const homepageScreenshot = findHomepageScreenshot(skillDir);
  const referencesDir = path.join(skillDir, 'references');
  fs.mkdirSync(referencesDir, { recursive: true });
  fs.writeFileSync(
    path.join(referencesDir, 'DESIGN.md'),
    generateDesignMd(profileWithFonts, homepageScreenshot),
    'utf-8'
  );
  fs.writeFileSync(path.join(referencesDir, 'SOURCE.md'), generateSourceMd(profile, source, skillDir), 'utf-8');
  writeTokensJson(profileWithFonts, skillDir);

  fs.mkdirSync(path.join(skillDir, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'agents', 'openai.yaml'), generateOpenAiYaml(profile.projectName, skillName), 'utf-8');
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), generateCodexSkillMd(profile, skillName, skillDir), 'utf-8');

  return { skillDir, skillName };
}

export function normalizeCodexSkillName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${normalized || 'extracted-design'}-design`;
}

function copyVisualArtifacts(workingDir: string | undefined, skillDir: string): void {
  if (!workingDir) return;
  const assetsDir = path.join(skillDir, 'assets');
  const sourceScreens = path.join(workingDir, 'screens');
  const sourceScreenshots = path.join(workingDir, 'screenshots');
  if (fs.existsSync(sourceScreens)) fs.cpSync(sourceScreens, path.join(assetsDir, 'screens'), { recursive: true });
  if (fs.existsSync(sourceScreenshots)) fs.cpSync(sourceScreenshots, path.join(assetsDir, 'screenshots'), { recursive: true });
}

function copyUsefulReferences(workingDir: string | undefined, skillDir: string): void {
  if (!workingDir) return;
  const sourceRefs = path.join(workingDir, 'references');
  if (!fs.existsSync(sourceRefs)) return;
  const destination = path.join(skillDir, 'references');
  fs.mkdirSync(destination, { recursive: true });

  for (const file of fs.readdirSync(sourceRefs)) {
    if (file === 'DESIGN.md' || !file.endsWith('.md')) continue;
    const sourceFile = path.join(sourceRefs, file);
    if (!fs.statSync(sourceFile).isFile()) continue;
    const content = fs.readFileSync(sourceFile, 'utf-8');
    // Ultra mode creates placeholders when Playwright is unavailable. They do not
    // describe extracted data and should not be packaged as a reference.
    if (content.includes('Install Playwright to enable:')) continue;
    fs.writeFileSync(path.join(destination, file), content.replace(/\.\.\/screens\//g, '../assets/screens/'), 'utf-8');
  }
}

function findHomepageScreenshot(skillDir: string): string | null {
  const screenshotsDir = path.join(skillDir, 'assets', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) return null;
  const image = fs.readdirSync(screenshotsDir).find(file => /\.(png|jpe?g|webp)$/i.test(file));
  return image ? `assets/screenshots/${image}` : null;
}

function generateSourceMd(profile: DesignProfile, source: CodexSource, skillDir: string): string {
  const labels: Record<CodexSource['type'], string> = {
    url: 'URL',
    repository: 'repository',
    'local-directory': 'local directory',
  };
  const assetsDir = path.join(skillDir, 'assets');
  const screenshotCount = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir, { recursive: true }).filter(file => typeof file === 'string' && /\.(png|jpe?g|webp)$/i.test(file)).length
    : 0;
  const pagesDir = path.join(assetsDir, 'screens', 'pages');
  const pagesAnalyzed = source.type === 'url'
    ? Math.max(1, fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir).filter(file => /\.(png|jpe?g|webp)$/i.test(file)).length : 0)
    : 'n/a (static source)';
  const sourceLine = source.value && source.type !== 'local-directory'
    ? `${source.type === 'repository' ? 'Repository' : 'Source'}: ${source.value}\n`
    : '';
  return `# Design Source\n\nSource type: ${labels[source.type]}\n${sourceLine}Extraction mode: ${source.mode}\nProject name: ${profile.projectName}\nExtracted at: ${new Date().toISOString()}\nPages analyzed: ${pagesAnalyzed}\nScreenshots captured: ${screenshotCount}\n`;
}

function generateOpenAiYaml(projectName: string, skillName: string): string {
  return `interface:\n  display_name: ${JSON.stringify(`${projectName} Design`)}\n  short_description: ${JSON.stringify(`Apply the extracted ${projectName} design system`)}\n  default_prompt: ${JSON.stringify(`Use $${skillName} to adapt the current frontend to the extracted ${projectName} design language while preserving application functionality.`)}\n\npolicy:\n  allow_implicit_invocation: true\n`;
}

function generateCodexSkillMd(profile: DesignProfile, skillName: string, skillDir: string): string {
  const refs = new Set(fs.existsSync(path.join(skillDir, 'references')) ? fs.readdirSync(path.join(skillDir, 'references')) : []);
  const hasVisuals = fs.existsSync(path.join(skillDir, 'assets', 'screens'));
  const name = profile.projectName || 'extracted';
  const description = `Apply the extracted ${name} design system when building or refactoring frontend UI. Use for visual design, components, typography, spacing, colors, layout, responsive behavior, interactions, or motion following the ${name} visual language. Do not use for backend-only tasks, database migrations, or unrelated infrastructure changes.`;
  const optionalReferences = [
    refs.has('INTERACTIONS.md') ? '- For hover, focus, and interaction work, read `references/INTERACTIONS.md`.' : '',
    refs.has('ANIMATIONS.md') ? '- For animated interfaces, read `references/ANIMATIONS.md`.' : '',
    (refs.has('VISUAL_GUIDE.md') || hasVisuals) ? '- For high visual fidelity, inspect `references/VISUAL_GUIDE.md` when present and `assets/screens/`.' : '',
  ].filter(Boolean).join('\n');
  const componentReference = refs.has('COMPONENTS.md')
    ? '- Read `references/COMPONENTS.md` before modifying or creating reusable components.\n'
    : '';
  const layoutReference = refs.has('LAYOUT.md')
    ? '- Read `references/LAYOUT.md` for page structure, containers, and responsive layout.\n'
    : '';

  return `---\nname: ${skillName}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name} Design Language\n\nUse this skill to adapt a frontend's presentation layer to the extracted ${name} visual language. Adapt design intent; do not clone source-site brands, logos, proprietary illustrations, marketing copy, or product-specific content unless the user explicitly requests them.\n\n## Before implementation\n\nInspect the target application first: its framework, component structure, routing, state management, existing design system, CSS architecture, UI libraries, and responsive behavior. Integrate with existing conventions; do not replace the framework, routing, state management, build tooling, APIs, or backend architecture for a visual task.\n\n## Progressive references\n\n- For most UI work, read \`references/DESIGN.md\` and \`references/SOURCE.md\`.\n- Use \`tokens/\` for raw colors, spacing, and typography values.\n${componentReference}${layoutReference}${optionalReferences}\n\nOnly read the detailed files needed for the current task. Every referenced path above exists in this skill.\n\n## Adaptation workflow\n\n1. Identify global styling infrastructure and reusable components in the target application.\n2. Map extracted tokens into the target's established token system: extend Tailwind configuration when Tailwind is used, CSS variables when they exist, or shared component themes when a library is in use.\n3. Update global primitives first, shared components second, and page-specific styling last.\n4. Preserve responsive behavior and validate desktop and narrow layouts.\n5. Check visual consistency, focus states, hover states, and motion after the change.\n\n## Design rules\n\n- Prioritize: explicit user instruction, target application functional requirements, extracted design system, existing target UI style, then conservative fallback styling.\n- Prefer extracted tokens and neighboring patterns over invented arbitrary values. Do not fabricate precision when extraction is incomplete.\n- Carry across hierarchy, color relationships, typography scale, spacing rhythm, radius, surfaces, shadows, density, layout principles, and motion behavior.\n- Keep the target application's identity, content, and functionality.\n\n## Preservation constraints\n\nDo not unintentionally change APIs, business logic, routes, authentication, state behavior, form behavior, data contracts, analytics, or backend integrations. For a redesign, make incremental presentation-layer changes unless the user explicitly asks for functional or architectural changes.\n\n## Validation\n\nBefore finishing, verify that changed UI uses the target project's existing styling approach, values trace to extracted tokens where available, shared components remain consistent, and responsive and interaction states still work.\n`;
}
