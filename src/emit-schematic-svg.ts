import type {
  Point,
  SchematicDocument,
  SchematicPinAnchor,
  SchematicSymbolInstance,
  SymbolSpec,
  SymbolTextPlacement,
} from "openpcb-schematic-core";
import { getSymbolSpecById } from "openpcb-schematic-symbols";

export interface EmitSchematicSvgOptions {
  padding?: number;
  stroke?: string;
  fill?: string;
  textColor?: string;
  background?: string;
  fontFamily?: string;
  fontSize?: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const DEFAULT_PADDING = 24;
const DEFAULT_STROKE = "#840000";
const DEFAULT_FILL = "#fffcc2";
const DEFAULT_TEXT_COLOR = "#0f0f0f";
const DEFAULT_BACKGROUND = "#ffffff";
const DEFAULT_FONT_FAMILY = "sans-serif";
const DEFAULT_FONT_SIZE = 12;

export function emitSchematicSvg(
  schematic: SchematicDocument,
  options: EmitSchematicSvgOptions = {},
): string {
  const symbols = schematic.sheets[0]?.items.filter(
    (item): item is SchematicSymbolInstance => item.kind === "symbol",
  ) ?? [];

  const bounds = computeBounds(symbols, options.padding ?? DEFAULT_PADDING);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(bounds.minX)} ${round(bounds.minY)} ${round(width)} ${round(height)}" width="${round(width)}" height="${round(height)}">`,
    `<rect x="${round(bounds.minX)}" y="${round(bounds.minY)}" width="${round(width)}" height="${round(height)}" fill="${escapeXml(
      options.background ?? DEFAULT_BACKGROUND,
    )}"/>`,
  ];

  for (const symbol of symbols) {
    const spec = resolveSymbolSpec(symbol);
    const groupParts = renderSymbol(symbol, spec, options);
    parts.push(`<g data-symbol-id="${escapeXml(symbol.id)}">${groupParts.join("")}</g>`);
  }

  parts.push("</svg>");
  return parts.join("");
}

function computeBounds(symbols: SchematicSymbolInstance[], padding: number): Bounds {
  if (symbols.length === 0) {
    return { minX: 0, minY: 0, maxX: padding * 2, maxY: padding * 2 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const symbol of symbols) {
    const spec = resolveSymbolSpec(symbol);
    const position = symbol.position ?? { x: 0, y: 0 };
    const halfWidth = spec.body.width / 2;
    const halfHeight = spec.body.height / 2;

    minX = Math.min(minX, position.x - halfWidth);
    minY = Math.min(minY, position.y - halfHeight);
    maxX = Math.max(maxX, position.x + halfWidth);
    maxY = Math.max(maxY, position.y + halfHeight);

    for (const pin of symbol.pins) {
      const pinPoint = addPoints(position, pin.offset ?? { x: 0, y: 0 });
      minX = Math.min(minX, pinPoint.x);
      minY = Math.min(minY, pinPoint.y);
      maxX = Math.max(maxX, pinPoint.x);
      maxY = Math.max(maxY, pinPoint.y);
    }

    if (spec.labels?.ref) {
      const point = addPoints(position, spec.labels.ref.offset);
      minX = Math.min(minX, point.x - 12);
      minY = Math.min(minY, point.y - 12);
      maxX = Math.max(maxX, point.x + 12);
      maxY = Math.max(maxY, point.y + 12);
    }

    if (spec.labels?.value && symbol.properties?.value) {
      const point = addPoints(position, spec.labels.value.offset);
      minX = Math.min(minX, point.x - 12);
      minY = Math.min(minY, point.y - 12);
      maxX = Math.max(maxX, point.x + 12);
      maxY = Math.max(maxY, point.y + 12);
    }
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

function renderSymbol(
  symbol: SchematicSymbolInstance,
  spec: SymbolSpec,
  options: EmitSchematicSvgOptions,
): string[] {
  const position = symbol.position ?? { x: 0, y: 0 };
  const stroke = options.stroke ?? DEFAULT_STROKE;
  const fill = options.fill ?? DEFAULT_FILL;
  const textColor = options.textColor ?? DEFAULT_TEXT_COLOR;
  const fontFamily = options.fontFamily ?? DEFAULT_FONT_FAMILY;
  const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
  const parts: string[] = [];

  parts.push(...renderPins(position, symbol.pins, spec, stroke));

  switch (spec.body.shape) {
    case "passive_capacitor":
      parts.push(...renderCapacitor(position, spec, stroke));
      break;
    case "passive_resistor":
      parts.push(...renderResistor(position, spec, stroke, fill));
      break;
    case "rect":
    default:
      parts.push(renderRectBody(position, spec, stroke, fill));
      break;
  }

  if (spec.labels?.ref) {
    parts.push(
      renderText(
        symbol.sourceRef,
        addPoints(position, spec.labels.ref.offset),
        spec.labels.ref,
        textColor,
        fontFamily,
        fontSize,
      ),
    );
  }

  if (spec.labels?.value && symbol.properties?.value) {
    parts.push(
      renderText(
        symbol.properties.value,
        addPoints(position, spec.labels.value.offset),
        spec.labels.value,
        textColor,
        fontFamily,
        fontSize,
      ),
    );
  }

  return parts;
}

function renderPins(
  position: Point,
  pins: SchematicPinAnchor[],
  spec: SymbolSpec,
  stroke: string,
): string[] {
  const parts: string[] = [];

  for (const pin of pins) {
    const pinPoint = addPoints(position, pin.offset ?? { x: 0, y: 0 });
    const bodyPoint = projectPinToBody(position, pin, spec);
    parts.push(
      `<line x1="${round(bodyPoint.x)}" y1="${round(bodyPoint.y)}" x2="${round(pinPoint.x)}" y2="${round(
        pinPoint.y,
      )}" stroke="${escapeXml(stroke)}" stroke-width="2"/>`,
    );
  }

  return parts;
}

function renderRectBody(position: Point, spec: SymbolSpec, stroke: string, fill: string): string {
  return `<rect x="${round(position.x - spec.body.width / 2)}" y="${round(position.y - spec.body.height / 2)}" width="${round(
    spec.body.width,
  )}" height="${round(spec.body.height)}" fill="${escapeXml(fill)}" stroke="${escapeXml(
    stroke,
  )}" stroke-width="2"/>`;
}

function renderResistor(position: Point, spec: SymbolSpec, stroke: string, fill: string): string[] {
  const x = position.x - spec.body.width / 2;
  const y = position.y - spec.body.height / 2;
  return [
    `<rect x="${round(x)}" y="${round(y)}" width="${round(spec.body.width)}" height="${round(
      spec.body.height,
    )}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="2"/>`,
  ];
}

function renderCapacitor(position: Point, spec: SymbolSpec, stroke: string): string[] {
  const halfWidth = spec.body.width / 2;
  const halfHeight = spec.body.height / 2;
  const leftPlate = position.x - 4;
  const rightPlate = position.x + 4;
  return [
    `<line x1="${round(leftPlate)}" y1="${round(position.y - halfHeight)}" x2="${round(leftPlate)}" y2="${round(
      position.y + halfHeight,
    )}" stroke="${escapeXml(stroke)}" stroke-width="2"/>`,
    `<line x1="${round(rightPlate)}" y1="${round(position.y - halfHeight)}" x2="${round(rightPlate)}" y2="${round(
      position.y + halfHeight,
    )}" stroke="${escapeXml(stroke)}" stroke-width="2"/>`,
    `<line x1="${round(position.x - halfWidth)}" y1="${round(position.y)}" x2="${round(leftPlate)}" y2="${round(
      position.y,
    )}" stroke="${escapeXml(stroke)}" stroke-width="2"/>`,
    `<line x1="${round(rightPlate)}" y1="${round(position.y)}" x2="${round(position.x + halfWidth)}" y2="${round(
      position.y,
    )}" stroke="${escapeXml(stroke)}" stroke-width="2"/>`,
  ];
}

function renderText(
  text: string,
  position: Point,
  placement: SymbolTextPlacement,
  fill: string,
  fontFamily: string,
  fontSize: number,
): string {
  const anchor = placement.anchor ?? "center";
  const textAnchor = anchor === "left" ? "start" : anchor === "right" ? "end" : "middle";
  const baseline = position.y < 0 ? "auto" : "middle";

  return `<text x="${round(position.x)}" y="${round(position.y)}" fill="${escapeXml(
    fill,
  )}" font-family="${escapeXml(fontFamily)}" font-size="${round(fontSize)}" text-anchor="${textAnchor}" dominant-baseline="${baseline}">${escapeXml(
    text,
  )}</text>`;
}

function resolveSymbolSpec(symbol: SchematicSymbolInstance): SymbolSpec {
  const direct = symbol.symbolSpecId ? getSymbolSpecById(symbol.symbolSpecId) : undefined;
  if (direct) {
    return direct;
  }

  const fallback = getSymbolSpecById(symbol.symbolKind) ?? getSymbolSpecById("generic_component");
  if (!fallback) {
    throw new Error(`Missing symbol spec for "${symbol.symbolKind}".`);
  }
  return fallback;
}

function projectPinToBody(position: Point, pin: SchematicPinAnchor, spec: SymbolSpec): Point {
  const halfWidth = spec.body.width / 2;
  const halfHeight = spec.body.height / 2;

  switch (pin.side) {
    case "left":
      return { x: position.x - halfWidth, y: position.y + (pin.offset?.y ?? 0) };
    case "right":
      return { x: position.x + halfWidth, y: position.y + (pin.offset?.y ?? 0) };
    case "top":
      return { x: position.x + (pin.offset?.x ?? 0), y: position.y - halfHeight };
    case "bottom":
      return { x: position.x + (pin.offset?.x ?? 0), y: position.y + halfHeight };
    default:
      return position;
  }
}

function addPoints(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
