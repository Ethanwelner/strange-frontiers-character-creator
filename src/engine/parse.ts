// Parses content files and checks each against its schema. No file system
// access, so the browser build can use it with files bundled at build time.
import { parse } from "yaml";
import type { ZodType } from "zod";
import { BackgroundPackage, Kind, Trait } from "../schema/index.js";

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

// One YAML file, with its path relative to content/, e.g. "kinds/human.yaml".
export interface ContentFile {
  path: string;
  text: string;
}

function load<T>(files: ContentFile[], folder: string, schema: ZodType<T>, errors: string[]): T[] {
  const seen = new Map<string, string>();
  const entries: T[] = [];
  const inFolder = files
    .filter((f) => f.path.startsWith(`${folder}/`) && f.path.endsWith(".yaml"))
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const { path: where, text } of inFolder) {
    const result = schema.safeParse(parse(text));
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${where}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    const id = (result.data as { id: string }).id;
    const fileId = where.split("/").pop()!.replace(/\.yaml$/, "");
    if (id !== fileId) errors.push(`${where}: id "${id}" doesn't match the file name`);
    if (seen.has(id)) errors.push(`${where}: id "${id}" is also used by ${seen.get(id)}`);
    seen.set(id, where);
    entries.push(result.data);
  }
  return entries;
}

export function parseContent(files: ContentFile[]): LoadResult {
  const errors: string[] = [];
  const kinds = load(files, "kinds", Kind, errors);
  const packages = ["origins", "professions", "pasts"].flatMap((f) => load(files, f, BackgroundPackage, errors));
  const traits = load(files, "traits", Trait, errors);
  return { content: { kinds, packages, traits }, errors };
}
