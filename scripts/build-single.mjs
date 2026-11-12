// single/app.ts + single/style.css → 루트 index.html (외부 파일 없이 열리는 한 장짜리)
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = await build({
  entryPoints: [path.join(root, "single/app.ts")],
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  write: false,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": root },
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync(path.join(root, "single/style.css"), "utf8");
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>재기지원 사업 규정 작성 지원</title>
<meta name="description" content="운영계획(안)과 참고 규정으로 운영규칙·운영요령 검토용 초안을 작성하고 변경사항을 추적합니다(HTML 한 장 버전, 데모·템플릿 모드).">
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<div id="toasts" aria-live="polite"></div>
<noscript>이 페이지는 자바스크립트가 필요합니다.</noscript>
<script>${js}</script>
<script>(function(){function s(){var h=document.querySelector('.top');if(h)document.documentElement.style.setProperty('--hdr',h.offsetHeight+'px')}new MutationObserver(s).observe(document.getElementById('app'),{childList:true});window.addEventListener('resize',s);s()})();</script>
</body>
</html>
`;
writeFileSync(path.join(root, "index.html"), html);
console.log(`index.html ${(html.length / 1024).toFixed(0)} KB`);
