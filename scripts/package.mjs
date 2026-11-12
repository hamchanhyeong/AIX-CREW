// 고객 전달용 압축 파일: release/재기지원_규정작성도구_v{버전}.zip
// 안에 site/ 전체 + 사용자설명서 + 실행 방법을 넣는다. 먼저 npm run build를 실행할 것.
import JSZip from "jszip";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const site = path.join(root, "site");
if (!existsSync(path.join(site, "index.html"))) throw new Error("site/가 없습니다. npm run build를 먼저 실행하세요.");

const top = `재기지원_규정작성도구_v${pkg.version}`;
const zip = new JSZip();
const dir = zip.folder(top);
function add(src, dest) {
  for (const name of readdirSync(src)) {
    const p = path.join(src, name);
    if (statSync(p).isDirectory()) add(p, `${dest}${name}/`);
    else dir.file(`${dest}${name}`, readFileSync(p));
  }
}
add(site, "");
dir.file("사용자설명서.md", readFileSync(path.join(root, "docs/사용자설명서.md")));
dir.file(
  "실행 방법.txt",
  [
    `재기지원 사업 규정 작성 지원 도구 v${pkg.version}`,
    "",
    "1. 이 폴더를 PC의 원하는 위치(예: 문서 폴더)에 압축 해제합니다.",
    "2. index.html 파일을 더블클릭해 Chrome 또는 Edge로 엽니다.",
    "   (assets 폴더가 index.html과 같은 폴더에 있어야 합니다)",
    "3. 처음이라면 '연습용 샘플로 먼저 해 보기'로 사용법을 익힌 뒤 실제 작업을 시작하세요.",
    "",
    "- 설치·인터넷 연결이 필요 없으며, 작업 내용은 이 PC의 브라우저 안에만 저장됩니다.",
    "- 다른 PC로 옮기거나 보관할 때는 화면의 '작업 파일 저장'으로 .json 파일을 받아 두세요.",
    "- 모든 결과는 검토용 초안입니다. 자세한 내용은 사용자설명서.md를 참고하세요.",
    "",
  ].join("\r\n"),
);
mkdirSync(path.join(root, "release"), { recursive: true });
const out = path.join(root, "release", `${top}.zip`);
writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } }));
console.log(`${path.relative(root, out)} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
