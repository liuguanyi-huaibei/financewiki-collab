import { copyFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";

const watch = process.argv.includes("--watch");
const outdir = "dist";

await mkdir(outdir, { recursive: true });
await copyFile("manifest.json", outdir + "/manifest.json");
await copyFile("styles.css", outdir + "/styles.css");

const options = {
  entryPoints: ["src/obsidian/main.ts"],
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2022",
  outfile: outdir + "/main.js",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
  external: [
    "obsidian",
    "@codemirror/state",
    "@codemirror/view"
  ],
};

if (watch) {
  const context = await (await import("esbuild")).context(options);
  await context.watch();
  console.log("Watching FinanceWiki Collaboration plugin sources...");
} else {
  await build(options);
  console.log("Obsidian plugin bundle created in " + outdir + "/");
}
