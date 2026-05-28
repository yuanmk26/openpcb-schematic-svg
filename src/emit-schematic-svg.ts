import type {
  Point,
  SchematicDocument,
  SchematicItem,
  SchematicJunction,
  SchematicNetLabel,
  SchematicPinAnchor,
  SchematicSymbolInstance,
  SchematicWire,
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
const DEFAULT_WIRE_WIDTH = 2;
const DEFAULT_JUNCTION_RADIUS = 3;
const NET_LABEL_TEXT_GAP = 6;

export function emitSchematicSvg(
  schematic: SchematicDocument,
  options: EmitSchematicSvgOptions = {},
): string {
  const items = schematic.sheets[0]?.items ?? [];

  const bounds = computeBounds(items, options.padding ?? DEFAULT_PADDING, options.fontSize ?? DEFAULT_FONT_SIZE);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const stroke = options.stroke ?? DEFAULT_STROKE;
  const textColor = options.textColor ?? DEFAULT_TEXT_COLOR;
  const fontFamily = options.fontFamily ?? DEFAULT_FONT_FAMILY;
  const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(bounds.minX)} ${round(bounds.minY)} ${round(width)} ${round(height)}" width="${round(width)}" height="${round(height)}">`,
    `<rect x="${round(bounds.minX)}" y="${round(bounds.minY)}" width="${round(width)}" height="${round(height)}" fill="${escapeXml(
      options.background ?? DEFAULT_BACKGROUND,
    )}"/>`,
  ];

  for (const wire of items.filter((item): item is SchematicWire => item.kind === "wire")) {
    parts.push(renderWire(wire, stroke));
  }

  for (const junction of items.filter((item): item is SchematicJunction => item.kind === "junction")) {
    parts.push(renderJunction(junction, stroke));
  }

  for (const symbol of items.filter((item): item is SchematicSymbolInstance => item.kind === "symbol")) {
    const spec = resolveSymbolSpec(symbol);
    const groupParts = renderSymbol(symbol, spec, options);
    parts.push(`<g data-symbol-id="${escapeXml(symbol.id)}">${groupParts.join("")}</g>`);
  }

  for (const label of items.filter((item): item is SchematicNetLabel => item.kind === "net_label")) {
    parts.push(renderNetLabel(label, textColor, fontFamily, fontSize));
  }

  parts.push("</svg>");
  return parts.join("");
}

function computeBounds(items: SchematicItem[], padding: number, fontSize: number): Bounds {
  if (items.length === 0) {
    return { minX: 0, minY: 0, maxX: padding * 2, maxY: padding * 2 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const symbol of items.filter((item): item is SchematicSymbolInstance => item.kind === "symbol")) {
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

      const bodyPoint = projectPinToBody(position, pin, spec);
      const labels: Point[] = [];
      if (pin.number !== undefined) {
        labels.push(pinNamePosition(bodyPoint, pinPoint));
      }
      labels.push(pinLabelPosition(bodyPoint, pinPoint));

      const labelRadius = 10;
      for (const lp of labels) {
        minX = Math.min(minX, lp.x - labelRadius);
        minY = Math.min(minY, lp.y - labelRadius);
        maxX = Math.max(maxX, lp.x + labelRadius);
        maxY = Math.max(maxY, lp.y + labelRadius);
      }
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

  for (const wire of items.filter((item): item is SchematicWire => item.kind === "wire")) {
    for (const point of wire.points) {
      minX = Math.min(minX, point.x - DEFAULT_WIRE_WIDTH);
      minY = Math.min(minY, point.y - DEFAULT_WIRE_WIDTH);
      maxX = Math.max(maxX, point.x + DEFAULT_WIRE_WIDTH);
      maxY = Math.max(maxY, point.y + DEFAULT_WIRE_WIDTH);
    }
  }

  for (const junction of items.filter((item): item is SchematicJunction => item.kind === "junction")) {
    minX = Math.min(minX, junction.position.x - DEFAULT_JUNCTION_RADIUS);
    minY = Math.min(minY, junction.position.y - DEFAULT_JUNCTION_RADIUS);
    maxX = Math.max(maxX, junction.position.x + DEFAULT_JUNCTION_RADIUS);
    maxY = Math.max(maxY, junction.position.y + DEFAULT_JUNCTION_RADIUS);
  }

  for (const label of items.filter((item): item is SchematicNetLabel => item.kind === "net_label")) {
    const labelBounds = computeNetLabelBounds(label, fontSize);
    minX = Math.min(minX, labelBounds.minX);
    minY = Math.min(minY, labelBounds.minY);
    maxX = Math.max(maxX, labelBounds.maxX);
    maxY = Math.max(maxY, labelBounds.maxY);
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

  // Phase 1: pin lines (behind body)
  parts.push(...renderPinLines(position, symbol.pins, spec, stroke));

  // Phase 2: body
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

  // Phase 3: pin labels (on top of body)
  parts.push(...renderPinLabels(position, symbol.pins, spec, textColor, fontFamily, fontSize));

  // Phase 4: ref/value labels
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

function renderWire(wire: SchematicWire, stroke: string): string {
  const points = wire.points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
  return `<polyline data-wire-id="${escapeXml(wire.id)}" points="${points}" fill="none" stroke="${escapeXml(
    stroke,
  )}" stroke-width="${DEFAULT_WIRE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function renderJunction(junction: SchematicJunction, fill: string): string {
  return `<circle data-junction-id="${escapeXml(junction.id)}" cx="${round(junction.position.x)}" cy="${round(
    junction.position.y,
  )}" r="${DEFAULT_JUNCTION_RADIUS}" fill="${escapeXml(fill)}"/>`;
}

function renderNetLabel(
  label: SchematicNetLabel,
  textColor: string,
  fontFamily: string,
  fontSize: number,
): string {
  const geometry = getNetLabelGeometry(label.position, label.orientation ?? "right", fontSize);
  return `<g data-net-label-id="${escapeXml(label.id)}"><text x="${round(
    geometry.textPosition.x,
  )}" y="${round(geometry.textPosition.y)}" fill="${escapeXml(textColor)}" font-family="${escapeXml(
    fontFamily,
  )}" font-size="${round(fontSize)}" text-anchor="${geometry.textAnchor}" dominant-baseline="middle">${escapeXml(
    label.netName,
  )}</text></g>`;
}

function renderPinLines(
  position: Point,
  pins: SchematicPinAnchor[],
  spec: SymbolSpec,
  stroke: string,
): string[] {
  return pins.map((pin) => {
    const pinPoint = addPoints(position, pin.offset ?? { x: 0, y: 0 });
    const bodyPoint = projectPinToBody(position, pin, spec);
    return `<line x1="${round(bodyPoint.x)}" y1="${round(bodyPoint.y)}" x2="${round(pinPoint.x)}" y2="${round(
      pinPoint.y,
    )}" stroke="${escapeXml(stroke)}" stroke-width="2"/>`;
  });
}

function renderPinLabels(
  position: Point,
  pins: SchematicPinAnchor[],
  spec: SymbolSpec,
  textColor: string,
  fontFamily: string,
  fontSize: number,
): string[] {
  const pinFontSize = Math.round(fontSize * 0.75);
  const parts: string[] = [];

  for (const pin of pins) {
    const pinPoint = addPoints(position, pin.offset ?? { x: 0, y: 0 });
    const bodyPoint = projectPinToBody(position, pin, spec);
    const nameAnchor = pinNameTextAnchor(pin.side);

    if (pin.number !== undefined) {
      const namePoint = pinNamePosition(bodyPoint, pinPoint);
      parts.push(
        `<text x="${round(namePoint.x)}" y="${round(namePoint.y)}" fill="${escapeXml(
          textColor,
        )}" font-family="${escapeXml(fontFamily)}" font-size="${pinFontSize}" text-anchor="${nameAnchor}" dominant-baseline="middle">${escapeXml(
          pin.name,
        )}</text>`,
      );

      const numberPoint = pinLabelPosition(bodyPoint, pinPoint);
      parts.push(
        `<text x="${round(numberPoint.x)}" y="${round(numberPoint.y)}" fill="${escapeXml(
          textColor,
        )}" font-family="${escapeXml(fontFamily)}" font-size="${pinFontSize}" text-anchor="middle" dominant-baseline="middle">${escapeXml(
          pin.number,
        )}</text>`,
      );
    } else {
      const labelPoint = pinLabelPosition(bodyPoint, pinPoint);
      parts.push(
        `<text x="${round(labelPoint.x)}" y="${round(labelPoint.y)}" fill="${escapeXml(
          textColor,
        )}" font-family="${escapeXml(fontFamily)}" font-size="${pinFontSize}" text-anchor="middle" dominant-baseline="middle">${escapeXml(
          pin.name,
        )}</text>`,
      );
    }
  }

  return parts;
}

function pinNameTextAnchor(side?: string): string {
  switch (side) {
    case "left":
      return "start";
    case "right":
      return "end";
    default:
      return "middle";
  }
}

function pinLabelPosition(
  bodyPoint: Point,
  pinPoint: Point,
): Point {
  const insetFromTip = 4;
  const perpendicularOffset = 5;
  const dx = pinPoint.x - bodyPoint.x;
  const dy = pinPoint.y - bodyPoint.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;

  // Place label at pin tip, offset inward toward body
  const baseX = pinPoint.x - ux * insetFromTip;
  const baseY = pinPoint.y - uy * insetFromTip;

  // Perpendicular offset: always up for horizontal pins, always right for vertical
  const isHorizontal = Math.abs(ux) > Math.abs(uy);
  if (isHorizontal) {
    return { x: baseX, y: baseY - perpendicularOffset };
  }
  return { x: baseX + perpendicularOffset, y: baseY };
}

function pinNamePosition(
  bodyPoint: Point,
  pinPoint: Point,
): Point {
  const insetFromEdge = 8;
  const perpendicularOffset = 5;
  const dx = pinPoint.x - bodyPoint.x;
  const dy = pinPoint.y - bodyPoint.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;

  // Place label inside body, offset inward from body edge toward center
  const baseX = bodyPoint.x - ux * insetFromEdge;
  const baseY = bodyPoint.y - uy * insetFromEdge;

  // Perpendicular offset: always up for horizontal pins, always right for vertical
  const isHorizontal = Math.abs(ux) > Math.abs(uy);
  if (isHorizontal) {
    return { x: baseX, y: baseY - perpendicularOffset };
  }
  return { x: baseX + perpendicularOffset, y: baseY };
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

function computeNetLabelBounds(label: SchematicNetLabel, fontSize: number): Bounds {
  const geometry = getNetLabelGeometry(label.position, label.orientation ?? "right", fontSize);
  const textWidth = estimateTextWidth(label.netName, fontSize);
  const textHalfHeight = fontSize * 0.6;
  const textPoints =
    geometry.textAnchor === "start"
      ? [
          geometry.textPosition,
          { x: geometry.textPosition.x + textWidth, y: geometry.textPosition.y },
        ]
      : geometry.textAnchor === "end"
        ? [
            geometry.textPosition,
            { x: geometry.textPosition.x - textWidth, y: geometry.textPosition.y },
          ]
        : [
            { x: geometry.textPosition.x - textWidth / 2, y: geometry.textPosition.y },
            { x: geometry.textPosition.x + textWidth / 2, y: geometry.textPosition.y },
          ];
  const points = [geometry.anchorPoint, ...textPoints];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y - textHalfHeight);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y + textHalfHeight);
  }

  return { minX, minY, maxX, maxY };
}

function getNetLabelGeometry(
  position: Point,
  orientation: "left" | "right" | "up" | "down",
  fontSize: number,
): {
  textPosition: Point;
  textAnchor: "start" | "end" | "middle";
  anchorPoint: Point;
} {
  switch (orientation) {
    case "left": {
      return {
        textPosition: { x: position.x - NET_LABEL_TEXT_GAP, y: position.y },
        textAnchor: "end",
        anchorPoint: position,
      };
    }
    case "up": {
      return {
        textPosition: { x: position.x, y: position.y - fontSize * 0.6 - NET_LABEL_TEXT_GAP },
        textAnchor: "middle",
        anchorPoint: position,
      };
    }
    case "down": {
      return {
        textPosition: { x: position.x, y: position.y + fontSize * 0.6 + NET_LABEL_TEXT_GAP },
        textAnchor: "middle",
        anchorPoint: position,
      };
    }
    case "right":
    default: {
      return {
        textPosition: { x: position.x + NET_LABEL_TEXT_GAP, y: position.y },
        textAnchor: "start",
        anchorPoint: position,
      };
    }
  }
}

function estimateTextWidth(text: string, fontSize: number): number {
  return Math.max(fontSize * 0.6, text.length * fontSize * 0.6);
}

function resolveSymbolSpec(symbol: SchematicSymbolInstance): SymbolSpec {
  if (symbol.symbolSpec) {
    return symbol.symbolSpec;
  }

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
