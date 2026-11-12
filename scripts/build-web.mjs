// web/(app.ts, style.css, index.html) → site/ (정적 반응형 웹: index.html + assets/app.js + assets/style.css)
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "site");
rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "assets"), { recursive: true });

await build({
  entryPoints: [path.join(root, "web/app.ts")],
  outfile: path.join(out, "assets/app.js"),
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": root },
});
copyFileSync(path.join(root, "web/style.css"), path.join(out, "assets/style.css"));
// 캐시 갱신용 버전(내용 해시)
const hash = createHash("sha1")
  .update(readFileSync(path.join(out, "assets/app.js")))
  .update(readFileSync(path.join(out, "assets/style.css")))
  .digest("hex")
  .slice(0, 8);
writeFileSync(path.join(out, "index.html"), readFileSync(path.join(root, "web/index.html"), "utf8").replaceAll("__VERSION__", hash));
writeFileSync(path.join(out, ".nojekyll"), "");
const kb = (f) => (readFileSync(path.join(out, f)).length / 1024).toFixed(0);
console.log(`site/ 생성: index.html, assets/app.js ${kb("assets/app.js")} KB, assets/style.css ${kb("assets/style.css")} KB (v=${hash})`);
