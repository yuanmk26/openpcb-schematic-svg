import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SchematicDocument } from "openpcb-schematic-core";
import { emitSchematicSvg } from "../src";

function readFixture(relativePath: string): SchematicDocument {
  return JSON.parse(readFileSync(new URL(`../../openpcb-dsl/${relativePath}`, import.meta.url), "utf8"));
}

describe("openpcb-schematic-svg", () => {
  it("renders connector symbols into svg", () => {
    const schematic = readFixture("examples/schematic/connector-header-1x4.schematic.json");
    const svg = emitSchematicSvg(schematic);

    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain("J1");
    expect(svg).toContain("data-symbol-id=\"symbol:J1\"");
  });

  it("renders passive component labels into svg", () => {
    const schematic = readFixture("examples/schematic/simple-pin-ops.schematic.json");
    const svg = emitSchematicSvg(schematic);

    expect(svg).toContain("R1");
    expect(svg).toContain("C1");
    expect(svg).toContain("10k");
    expect(svg).toContain("100nF");
  });
});
