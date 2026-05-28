import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SchematicDocument, SymbolSpec } from "openpcb-schematic-core";
import { emitSchematicSvg } from "../src";

function readFixture(relativePath: string): SchematicDocument {
  return JSON.parse(readFileSync(new URL(`../examples/fixtures/${relativePath}`, import.meta.url), "utf8"));
}

describe("openpcb-schematic-svg", () => {
  it("renders connector symbols into svg", () => {
    const schematic = readFixture("connector-header-1x4.schematic.json");
    const svg = emitSchematicSvg(schematic);

    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain("J1");
    expect(svg).toContain("data-symbol-id=\"symbol:J1\"");
  });

  it("renders passive component labels into svg", () => {
    const schematic = readFixture("simple-pin-ops.schematic.json");
    const svg = emitSchematicSvg(schematic);

    expect(svg).toContain("R1");
    expect(svg).toContain("C1");
    expect(svg).toContain("10k");
    expect(svg).toContain("100nF");
  });

  it("prefers inline symbol specs over registry lookup", () => {
    const inlineSpec: SymbolSpec = {
      id: "inline:test",
      kind: "imported_component",
      displayName: "Inline Symbol",
      body: {
        width: 80,
        height: 30,
        shape: "rect",
      },
      pins: [
        {
          name: "A",
          number: "1",
          side: "left",
          offset: { x: -50, y: 0 },
          direction: "passive",
          electricalType: "passive",
        },
        {
          name: "B",
          number: "2",
          side: "right",
          offset: { x: 50, y: 0 },
          direction: "passive",
          electricalType: "passive",
        },
      ],
      labels: {
        ref: {
          offset: { x: 0, y: -28 },
          anchor: "center",
        },
        value: {
          offset: { x: 0, y: 28 },
          anchor: "center",
        },
      },
    };

    const schematic: SchematicDocument = {
      id: "doc-1",
      title: "Inline",
      sheets: [
        {
          id: "sheet-1",
          name: "Sheet 1",
          items: [
            {
              kind: "symbol",
              id: "symbol:U1",
              sourceRef: "U1",
              symbolKind: "generic_component",
              symbolSpecId: "missing_symbol",
              symbolSpec: inlineSpec,
              position: { x: 0, y: 0 },
              pins: inlineSpec.pins.map((pin) => ({
                id: `pin:U1:${pin.name}`,
                name: pin.name,
                number: pin.number,
                side: pin.side,
                offset: pin.offset,
                direction: pin.direction,
                electricalType: pin.electricalType,
              })),
              properties: {
                value: "INLINE",
              },
            },
          ],
        },
      ],
    };

    const svg = emitSchematicSvg(schematic);

    expect(svg).toContain("U1");
    expect(svg).toContain("INLINE");
    expect(svg).toContain("width=\"160\"");
  });
});
