const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function bumpPatchVersion(version: string): string {
  const match = SEMVER_PATTERN.exec(version);
  if (match === null) return version;
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}
