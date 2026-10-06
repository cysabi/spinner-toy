// The graph, as SVG: every curve, the active one in front, the cursor and the
// active curve's points.

import { NAMES, shownValue, yRange, type Config, type Name } from "./model.ts";

export const COLORS: Record<Name, string> = {
    target: "#6ee7a0",
    tension: "#ffd23f",
    mass: "#4fb3ff",
    friction: "#ff5c8a",
};

const INK = "#e8e6f0";
const DIM = "#7d7a8c";

/** The graph box's inset, in CSS px: the same as the bar above it. */
const INSET = 6;
/** Between the y labels and the plot, and the plot and the x labels. */
const LABEL_GAP = 4;
/** Axis label size, like the rest of the page's text. */
const LABEL_PX = 11;
/** Line widths, in CSS px: the cabinet scales them with the page. */
const LINE = { grid: 1, curve: 2.5, cursor: 1.5 };

export interface GraphView {
    config: Config;
    active: Name;
    /** Where the knob is shown. */
    cursor: number;
    /** The cursor's point, if it's on one. */
    snap: number | undefined;
    range: [number, number];
}

/** Most vertical grid lines, so their labels never crowd. */
const MAX_GRID_LINES = 6;

/** Degrees between grid lines across `span`: fractions of a turn, then
 *  1, 2 and 5 times powers of ten turns. */
export function gridStep(span: number): number {
    for (const step of [5, 10, 15, 30, 45, 90, 180]) if (span / step <= MAX_GRID_LINES) return step;
    for (let scale = 1; ; scale *= 10) {
        for (const turns of [1, 2, 5]) if (span / (turns * scale * 360) <= MAX_GRID_LINES) return turns * scale * 360;
    }
}

const SVG = "http://www.w3.org/2000/svg";

function element<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attributes: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    parent.append(node);
    return node;
}

function set(node: Element, attributes: Record<string, string | number>): void {
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
}

export class Graph {
    private readonly svg: SVGSVGElement;
    private readonly grid: SVGGElement;
    private readonly curves: Record<Name, SVGPathElement>;
    private readonly points: SVGGElement;
    private readonly cursorLine: SVGLineElement;
    private readonly cursorDot: SVGCircleElement;
    private readonly ruler: SVGTextElement;
    private width = 0;
    private height = 0;
    /** What the curves were last drawn for, to skip redrawing them. */
    private drawn?: { config: Config; active: Name; range: string; size: string; snap: number | undefined };

    constructor(svg: SVGSVGElement) {
        this.svg = svg;
        this.grid = element(svg, "g");
        this.curves = Object.fromEntries(NAMES.map(name => [name, element(svg, "path", {
            fill: "none", stroke: COLORS[name], "stroke-linejoin": "round",
        })])) as Record<Name, SVGPathElement>;
        this.points = element(svg, "g");
        this.cursorLine = element(svg, "line", { stroke: INK, "stroke-width": LINE.cursor });
        this.cursorDot = element(svg, "circle", { r: 4 });
        this.ruler = element(svg, "text", { "font-size": LABEL_PX, visibility: "hidden" });
    }

    /** The plotting area, in CSS px. */
    /** Room around the plot for its labels, worked out from them. */
    private margin = { left: 0, right: 0, top: 0, bottom: 0 };

    private get plot() {
        const { left, right, top, bottom } = this.margin;
        return { x: left, y: top, w: this.width - left - right, h: this.height - top - bottom };
    }

    private x(range: [number, number], angle: number): number {
        const { x, w } = this.plot;
        return x + (angle - range[0]) / (range[1] - range[0]) * w;
    }

    private y([low, high]: [number, number], value: number): number {
        const { y, h } = this.plot;
        return y + h - (value - low) / (high - low) * h;
    }

    /** The angle under a client x, clamped to the plot. */
    angleAt(range: [number, number], clientX: number): number {
        const box = this.svg.getBoundingClientRect();
        const { x, w } = this.plot;
        const px = Math.max(x, Math.min(x + w, (clientX - box.left) * this.width / box.width));
        return range[0] + (px - x) / w * (range[1] - range[0]);
    }

    render(view: GraphView): void {
        const { config, active, range } = view;
        this.width = this.svg.clientWidth;
        this.height = this.svg.clientHeight;
        if (!this.width || !this.height) return;
        set(this.svg, { viewBox: `0 0 ${this.width} ${this.height}` });
        const size = `${this.width}x${this.height}`;
        const key = { config, active, range: range.join(), size, snap: view.snap };
        const drawn = this.drawn;
        if (!drawn || drawn.config !== config || drawn.active !== active || drawn.range !== key.range || drawn.size !== size || drawn.snap !== view.snap) {
            this.drawn = key;
            this.margin = this.margins(config, active, range);
            this.drawGrid(config, active, range);
            this.drawCurves(config, active, range);
            this.drawPoints(view);
        }
        // The cursor moves every frame.
        const yr = yRange(config, active, range);
        const x = this.x(range, view.cursor);
        const { y, h } = this.plot;
        set(this.cursorLine, { x1: x, x2: x, y1: y, y2: y + h, "stroke-dasharray": view.snap === undefined ? "3 3" : "none" });
        set(this.cursorDot, { cx: x, cy: this.y(yr, shownValue(config, active, view.cursor)), fill: COLORS[active] });
    }

    /** How wide a label is drawn, measured by an invisible copy of it. */
    private measure(text: string): number {
        this.ruler.textContent = text;
        return this.ruler.getComputedTextLength();
    }

    /** The grid's labels: angles along x, the active curve's values up y. */
    private labels(config: Config, active: Name, range: [number, number]) {
        const step = gridStep(range[1] - range[0]);
        const xs: number[] = [];
        for (let angle = Math.ceil(range[0] / step) * step; angle <= range[1]; angle += step) xs.push(angle);
        const [low, high] = yRange(config, active, range);
        const ys = [0, 0.5, 1].map(fraction => {
            const value = low + (high - low) * fraction;
            return { fraction, text: active === "target" ? `${Math.round(value)}` : value.toFixed(1) };
        });
        return { xs, ys };
    }

    /** Margins that fit the labels inside the box's inset: y labels from the
     *  left inset, the first and last x labels' halves within the sides, the
     *  top label 6px under the bar, the x labels 6px above the bottom. */
    private margins(config: Config, active: Name, range: [number, number]) {
        const { xs, ys } = this.labels(config, active, range);
        const width = (text: string) => this.measure(text);
        const yWidth = Math.max(...ys.map(label => width(label.text)));
        const half = (angle: number | undefined) => angle === undefined ? 0 : width(`${angle}`) / 2;
        // The first and last x labels may sit right at the plot's ends.
        return {
            left: INSET + Math.max(yWidth + LABEL_GAP, half(xs[0])),
            right: INSET + half(xs[xs.length - 1]),
            // A label is centred on its line: half its height above the plot.
            top: INSET + LABEL_PX / 2,
            bottom: INSET + LABEL_PX + LABEL_GAP,
        };
    }

    private drawGrid(config: Config, active: Name, range: [number, number]): void {
        this.grid.replaceChildren();
        const { x, y, w, h } = this.plot;
        const { xs, ys } = this.labels(config, active, range);
        for (const angle of xs) {
            const px = this.x(range, angle);
            element(this.grid, "line", { x1: px, x2: px, y1: y, y2: y + h, class: angle % 360 === 0 ? "turn-line" : "grid-line", "stroke-width": LINE.grid });
            // The baseline: the label's cap height below the gap.
            element(this.grid, "text", { x: px, y: y + h + LABEL_GAP + LABEL_PX * 0.75, fill: DIM, "font-size": LABEL_PX, "text-anchor": "middle" }).textContent = `${angle}`;
        }
        for (const { fraction, text } of ys) {
            const py = y + h - fraction * h;
            element(this.grid, "line", { x1: x, x2: x + w, y1: py, y2: py, class: "grid-line", "stroke-width": LINE.grid });
            element(this.grid, "text", { x: x - LABEL_GAP, y: py + LABEL_PX * 0.35, fill: DIM, "font-size": LABEL_PX, "text-anchor": "end" }).textContent = text;
        }
    }

    private drawCurves(config: Config, active: Name, range: [number, number]): void {
        const { x, w } = this.plot;
        // One sample per CSS px is enough: the cabinet's screen is 336 px wide.
        const samples = Math.max(2, Math.round(w));
        for (const name of NAMES) {
            const yr = yRange(config, name, range);
            let d = "";
            for (let i = 0; i <= samples; i++) {
                const px = x + w * i / samples;
                const angle = range[0] + (range[1] - range[0]) * i / samples;
                d += `${i ? "L" : "M"}${px.toFixed(1)},${this.y(yr, shownValue(config, name, angle)).toFixed(1)}`;
            }
            set(this.curves[name], { d, opacity: name === active ? 1 : 0.35, "stroke-width": LINE.curve });
        }
        // The active curve in front.
        this.svg.insertBefore(this.curves[active], this.points);
    }

    private drawPoints(view: GraphView): void {
        const { config, active, range } = view;
        this.points.replaceChildren();
        const yr = yRange(config, active, range);
        // Points packed closer than a marker apart get smaller markers, so
        // they don't merge into one thick line.
        const xs = config[active].points.map(point => this.x(range, point.x));
        const gaps = xs.slice(1).map((x, i) => x - xs[i]).filter(gap => gap > 0);
        const crowded = gaps.length > 0 && Math.min(...gaps) < 6;
        for (const point of config[active].points) {
            const size = point.x === view.snap ? 7 : crowded ? 2 : 4;
            element(this.points, "rect", {
                x: this.x(range, point.x) - size / 2, y: this.y(yr, point.y) - size / 2, width: size, height: size, fill: COLORS[active],
            });
        }
    }
}
