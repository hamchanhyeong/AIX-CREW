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

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const common = {
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"', __APP_VERSION__: JSON.stringify(pkg.version) },
  alias: { "@": root },
  logLevel: "warning",
};
// 앱 본체 + 필요할 때만 불러오는 원문 읽기 모듈(PDF·DOCX)
await build({ ...common, entryPoints: [path.join(root, "web/app.ts")], outfile: path.join(out, "assets/app.js") });
await build({ ...common, entryPoints: [path.join(root, "web/importers/docx.ts")], outfile: path.join(out, "assets/import-docx.js") });
await build({ ...common, entryPoints: [path.join(root, "web/importers/pdf.ts")], outfile: path.join(out, "assets/import-pdf.js"), target: "es2022" });
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
console.log(`site/ 생성 v${pkg.version}: app.js ${kb("assets/app.js")} KB, import-pdf.js ${kb("assets/import-pdf.js")} KB, import-docx.js ${kb("assets/import-docx.js")} KB, style.css ${kb("assets/style.css")} KB (캐시 ${hash})`);
