import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(__dirname, "generated");
const distPath = path.join(rootDir, "dist", "index.js");
const distUrl = new URL(
  `../dist/index.js?v=${statSync(distPath).mtimeMs}`,
  import.meta.url,
);
const { emitSchematicSvg } = await import(distUrl.href);

const examples = [
  {
    input: path.join(__dirname, "fixtures", "connector-header-1x4.schematic.json"),
    output: path.join(outputDir, "connector-header-1x4.svg"),
  },
  {
    input: path.join(__dirname, "fixtures", "simple-pin-ops.schematic.json"),
    output: path.join(outputDir, "simple-pin-ops.svg"),
  },
  {
    input: path.join(__dirname, "fixtures", "wire-only.schematic.json"),
    output: path.join(outputDir, "wire-only.svg"),
  },
  {
    input: path.join(__dirname, "fixtures", "net-label-orientations.schematic.json"),
    output: path.join(outputDir, "net-label-orientations.svg"),
  },
  {
    input: path.join(__dirname, "fixtures", "junction-fanout.schematic.json"),
    output: path.join(outputDir, "junction-fanout.svg"),
  },
];

mkdirSync(outputDir, { recursive: true });

for (const example of examples) {
  const schematic = JSON.parse(readFileSync(example.input, "utf8"));
  const svg = emitSchematicSvg(schematic, {
    background: "#fffdf5",
    fill: "#fff4bf",
    fontFamily: "Arial, sans-serif",
    stroke: "#8f3d00",
    textColor: "#1a1a1a",
  });

  writeFileSync(example.output, svg, "utf8");
  console.log(`wrote ${path.relative(rootDir, example.output)}`);
}
