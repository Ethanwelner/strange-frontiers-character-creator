// The game's content, bundled at build time. The engine's loader reads from
// disk, which the browser can't, so Vite inlines every YAML file here and the
// engine's own parser and schemas check them.
import { parseContent, type ContentFile } from "../engine/parse.js";

const PREFIX = "../../content/";

const raw = import.meta.glob<string>("../../content/**/*.yaml", { query: "?raw", import: "default", eager: true });

const files: ContentFile[] = Object.entries(raw).map(([path, text]) => ({ path: path.slice(PREFIX.length), text }));

export const { content, errors: contentErrors } = parseContent(files);

export const traitById = new Map(content.traits.map((t) => [t.id, t]));
export const packageById = new Map(content.packages.map((p) => [p.id, p]));
export const kindById = new Map(content.kinds.map((k) => [k.id, k]));
