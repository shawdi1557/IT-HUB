// Copies the builder's pure modules into supabase/functions/_shared/builder/ for the quotation Edge Function.
//
// Why a copy: the Edge Runtime (1.77.8, Deno 2.1.4) can read files outside supabase/functions/, but it can't
// resolve the builder's extension-less imports ("./types"), and those files can't be edited for it (compatibility.ts
// is fixed by its recorded hash). The copy is the source with ".ts" added to each relative import and a header,
// nothing else, so the server runs exactly the browser's rules.
//
//   node scripts/sync-server-builder.cjs          write the copies
//   node scripts/sync-server-builder.cjs --check  exit 1 if any copy differs from what would be written
//
// `supabase/functions/tests/pc-builder-server-builder.test.ts` makes the same check on every test run.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = "src/lib/builder";
const TARGET_DIR = "supabase/functions/_shared/builder";

/** The modules the server uses, and everything they import. Each imports only the others. */
const MODULES = [
  "types",
  "spec-schema",
  "slots",
  "pricing",
  "ranking",
  "purpose",
  "compatibility",
  "completeness",
  "slot-detection",
  // Stage 4S-2: how a product's specifications are read and resolved.
  "shopify-fields",
  "spec-registry",
];

const header = (name) =>
  `// GENERATED from ${SOURCE_DIR}/${name}.ts by scripts/sync-server-builder.cjs. Don't edit: change the source and\n` +
  `// run \`node scripts/sync-server-builder.cjs\`. Only ".ts" is added to relative imports.\n\n`;

/** The source with ".ts" on each relative import, line endings as LF. */
function serverCopy(name, source) {
  const body = source
    .replace(/\r\n/g, "\n")
    .replace(/(\bfrom\s*["'])(\.\.?\/[^"']+?)(["'])/g, (match, open, spec, close) =>
      /\.(?:ts|tsx|js|mjs|json)$/.test(spec) ? match : `${open}${spec}.ts${close}`,
    );
  return header(name) + body;
}

function main() {
  const check = process.argv.includes("--check");
  const stale = [];
  for (const name of MODULES) {
    const source = fs.readFileSync(path.join(ROOT, SOURCE_DIR, `${name}.ts`), "utf8");
    // Every relative import must point at another copied module, or the server copy would break.
    for (const [, spec] of source.matchAll(/\bfrom\s*["'](\.\.?\/[^"']+)["']/g)) {
      const target = spec.replace(/^\.\//, "").replace(/\.ts$/, "");
      if (!MODULES.includes(target))
        throw new Error(`${name}.ts imports ${spec}, which isn't copied`);
    }
    const wanted = serverCopy(name, source);
    const targetPath = path.join(ROOT, TARGET_DIR, `${name}.ts`);
    const current = fs.existsSync(targetPath)
      ? fs.readFileSync(targetPath, "utf8").replace(/\r\n/g, "\n")
      : null;
    if (current === wanted) continue;
    stale.push(name);
    if (!check) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, wanted);
    }
  }
  if (check) {
    if (stale.length > 0) {
      console.log(`Out of date: ${stale.join(", ")}. Run: node scripts/sync-server-builder.cjs`);
      process.exit(1);
    }
    console.log(`All ${MODULES.length} server copies match their sources.`);
  } else {
    console.log(stale.length ? `Wrote ${stale.join(", ")}.` : "Nothing to write.");
  }
}

if (require.main === module) main();
module.exports = { MODULES, serverCopy };
