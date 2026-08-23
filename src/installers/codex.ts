import * as fs from 'fs';
import * as path from 'path';

/** Install a complete skill directory without modifying the target project's AGENTS.md. */
export function installCodexSkill(sourceSkillDir: string, projectDir: string, skillName: string, force = false): string {
  const resolvedProject = path.resolve(projectDir);
  if (!fs.existsSync(resolvedProject) || !fs.statSync(resolvedProject).isDirectory()) {
    throw new Error(`Target project directory not found: ${resolvedProject}`);
  }

  const destination = path.join(resolvedProject, '.agents', 'skills', skillName);
  if (fs.existsSync(destination)) {
    if (!force) throw new Error(`Skill already exists. Refusing to overwrite: ${destination} (use --force to replace it)`);
    fs.rmSync(destination, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(sourceSkillDir, destination, { recursive: true });
  return destination;
}

export function codexUserSkillsDirectory(): string | null {
  const homeDir = process.env.USERPROFILE || process.env.HOME;
  return homeDir ? path.join(homeDir, '.agents', 'skills') : null;
}
