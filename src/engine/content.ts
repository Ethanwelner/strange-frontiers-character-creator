// Loads every YAML file under content/ and checks it against its schema.
// Shared by the content validator script and the rules engine.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { ZodType } from "zod";
import { BackgroundPackage, Kind, Trait } from "../schema/index.js";

export const CONTENT_ROOT = fileURLToPath(new URL("../../content", import.meta.url));

export interface Content {
  kinds: Kind[];
  packages: BackgroundPackage[];
  traits: Trait[];
}

export interface LoadResult {
  content: Content;
  // Schema failures and duplicate or mismatched ids, as "path: message".
  errors: string[];
}

function yamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return yamlFiles(path);
    return e.name.endsWith(".yaml") ? [path] : [];
  });
}

function load<T>(root: string, folder: string, schema: ZodType<T>, errors: string[]): T[] {
  const seen = new Map<string, string>();
  const entries: T[] = [];
  for (const file of yamlFiles(join(root, folder))) {
    const where = relative(root, file);
    const result = schema.safeParse(parse(readFileSync(file, "utf8")));
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${where}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    const id = (result.data as { id: string }).id;
    if (id !== basename(file, ".yaml")) errors.push(`${where}: id "${id}" doesn't match the file name`);
    if (seen.has(id)) errors.push(`${where}: id "${id}" is also used by ${seen.get(id)}`);
    seen.set(id, where);
    entries.push(result.data);
  }
  return entries;
}

export function loadContent(root: string = CONTENT_ROOT): LoadResult {
  const errors: string[] = [];
  const kinds = load(root, "kinds", Kind, errors);
  const packages = ["origins", "professions", "pasts"].flatMap((f) => load(root, f, BackgroundPackage, errors));
  const traits = load(root, "traits", Trait, errors);
  return { content: { kinds, packages, traits }, errors };
}
