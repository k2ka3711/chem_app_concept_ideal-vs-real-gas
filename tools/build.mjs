// Build the single-file app: node tools/build.mjs [artifact-out.html]
// - index.html: complete page (open it directly, or serve it with GitHub Pages)
// - optional second file: the same page without <html>/<head>/<body> (for a claude.ai Artifact)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const strip = (js) => js.replace(/\nif \(typeof module[^\n]*\n?/, "\n");

let html = read("src/app.html")
  .replace("/*@ENGINE*/", () => strip(read("src/engine.js")))
  .replace("/*@VDW*/", () => strip(read("src/vdw.js")))
  .replace("@SCHOLA_B64@", () => readFileSync(join(root, "fonts/texgyreschola-italic-subset.ttf")).toString("base64"));

writeFileSync(join(root, "index.html"), html.replace(/[ \t]*<!--@ARTIFACT-[A-Z-]+-->\n/g, ""));
console.log("wrote index.html", (html.length / 1024).toFixed(0) + " KB");

const out = process.argv[2];
if (out) {
  const cut = (a, b) => html.slice(html.indexOf(a) + a.length, html.indexOf(b));
  const art = cut("<!--@ARTIFACT-START-->", "<!--@ARTIFACT-HEAD-END-->") + cut("<!--@ARTIFACT-BODY-START-->", "<!--@ARTIFACT-END-->");
  writeFileSync(out, art.trim() + "\n");
  console.log("wrote", out);
}
