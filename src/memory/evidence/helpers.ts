import type { ScannedFile } from "../../types.js";

export function isProductionFile(file: ScannedFile): boolean {
  return !/(^|\/)(test|tests|__tests__|fixtures?|mocks?)\//i.test(file.path);
}

export function hasPiniaEvidence(file: ScannedFile): boolean {
  for (const rawLine of file.content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("*")) continue;
    if (/^import\s+.*\s+from\s+['"]pinia['"]/.test(line)) return true;
    if (/^import\s+['"]pinia-plugin-persistedstate['"]/.test(line)) {
      return true;
    }
    if (
      /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*defineStore\s*\(/.test(
        line,
      )
    ) {
      return true;
    }
    if (/\bcreatePinia\s*\(/.test(line) && !line.includes("=>")) return true;
  }
  return false;
}

export function hasSecurityEvidence(file: ScannedFile): boolean {
  const isJava = file.extension === ".java";
  const isVue = file.extension === ".vue";
  const isScript = [".ts", ".js", ".tsx", ".jsx"].includes(file.extension);
  const isPermissionFile = /(^|\/)(permission|directives|security)\//i.test(
    file.path,
  );

  for (const rawLine of file.content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("*")) continue;
    if (isJava && /@(?:Valid|Validated|PreAuthorize)\b/.test(line)) {
      return true;
    }
    if ((isScript || isVue) && /^import\s+.*permission/.test(line)) {
      return true;
    }
    if (
      (isVue || isPermissionFile) &&
      /v-has(Permi|Role)/.test(line) &&
      !line.includes("rules.includes")
    ) {
      return true;
    }
    if (isJava && /^(class|interface)\s+\w*(Security|Xss)\w*/.test(line)) {
      return true;
    }
    if (/^(?:return\s+)?sanitize\s*\(/.test(line)) return true;
  }
  return false;
}
