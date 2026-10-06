// The curves as the toy edits them: each one a chain of points in degrees,
// like the knob's own wire format. `toCurves` turns them into the client
// library's `Curves`, which also does the maths, so what's drawn is what the
// knob computes.

import { Curve, Curves, type CurvePointInput } from "@rcade/plugin-input-spinners";

export const NAMES = ["target", "tension", "mass", "friction"] as const;
export type Name = typeof NAMES[number];

/** One point. `in` and `out` are handle values at ⅔ of the segment before
 *  and ⅓ of the one after; missing means on the straight line. */
export interface Point { x: number; y: number; in?: number; out?: number }

/** A chain of finite points; past an end it repeats, unless that end is flat. */
export interface EditCurve { points: Point[]; flatBefore: boolean; flatAfter: boolean }

export type Config = Record<Name, EditCurve>;

/** How close the cursor must be to a point to be on it, in degrees. */
export const SNAP = 3;

/** The values each curve may take: target is degrees, the rest 0..1. */
export function clampValue(name: Name, y: number): number {
    return name === "target" ? y : Math.min(1, Math.max(0, y));
}

/** A library curve as an editable chain. */
export function fromCurve(curve: Curve): EditCurve {
    const all = curve.points;
    const finite = all.filter(point => Number.isFinite(point.x));
    const flatBefore = all[0].x === -Infinity;
    const flatAfter = all[all.length - 1].x === Infinity;
    if (finite.length === 0) return { points: [{ x: 0, y: all[0].y }], flatBefore: true, flatAfter: true };
    const points = finite.map((point, index): Point => {
        const out: Point = { x: point.x, y: point.y };
        const next = finite[index + 1];
        const previous = finite[index - 1];
        const third = (from: number, to: number, at: number) => from + (to - from) * at;
        if (next && next.x > point.x && Math.abs(point.out.y - third(point.y, next.y, 1 / 3)) > 1e-9) out.out = point.out.y;
        if (previous && previous.x < point.x && Math.abs(point.in.y - third(previous.y, point.y, 2 / 3)) > 1e-9) out.in = point.in.y;
        return out;
    });
    return { points, flatBefore, flatAfter };
}

/** Edits always make new chains, so each is converted once. */
const converted = new WeakMap<EditCurve, Curve>();

/** An editable chain as a library curve. */
export function toCurve(edit: EditCurve): Curve {
    let curve = converted.get(edit);
    if (!curve) converted.set(edit, curve = convert(edit));
    return curve;
}

function convert(edit: EditCurve): Curve {
    const { points } = edit;
    const input: CurvePointInput[] = points.map((point, index) => {
        const next = points[index + 1];
        const previous = points[index - 1];
        const at: CurvePointInput = { x: point.x, y: point.y };
        if (point.out !== undefined && next && next.x > point.x) at.out = { x: point.x + (next.x - point.x) / 3, y: point.out };
        if (point.in !== undefined && previous && previous.x < point.x) at.in = { x: point.x - (point.x - previous.x) / 3, y: point.in };
        return at;
    });
    if (edit.flatBefore) input.unshift({ x: -Infinity, y: points[0].y });
    if (edit.flatAfter) input.push({ x: Infinity, y: points[points.length - 1].y });
    return Curve.points(input);
}

export function toCurves(config: Config): Curves {
    return Curves.create()
        .target(toCurve(config.target))
        .tension(toCurve(config.tension))
        .mass(toCurve(config.mass))
        .friction(toCurve(config.friction));
}

export function fromCurves(curves: Curves): Config {
    return {
        target: fromCurve(curves.get("target")),
        tension: fromCurve(curves.get("tension")),
        mass: fromCurve(curves.get("mass")),
        friction: fromCurve(curves.get("friction")),
    };
}

/** The x of the point the cursor is on, if it's within `SNAP` of one. */
export function snapped(edit: EditCurve, cursor: number): number | undefined {
    let best: number | undefined;
    for (const point of edit.points) {
        if (Math.abs(point.x - cursor) <= SNAP && (best === undefined || Math.abs(point.x - cursor) < Math.abs(best - cursor))) best = point.x;
    }
    return best;
}

/** The distinct point xs, in order: where the joystick snaps to. */
export function stops(edit: EditCurve): number[] {
    return [...new Set(edit.points.map(point => point.x))];
}

/** The next point x left (-1) or right (+1) of the cursor. */
export function nextStop(edit: EditCurve, cursor: number, direction: -1 | 1): number | undefined {
    const xs = stops(edit);
    const on = snapped(edit, cursor);
    if (direction > 0) return xs.find(x => x > (on ?? cursor));
    return [...xs].reverse().find(x => x < (on ?? cursor));
}

/** The index of the point the editor drags at `x`: at a jump, the later one,
 *  which is the value at that x. */
function pointAt(edit: EditCurve, x: number): number {
    return edit.points.findLastIndex(point => point.x === x);
}

/** The curve with a point at `x`, worth what the curve is worth there. The
 *  segment it lands in becomes straight on both sides. */
export function addPoint(edit: EditCurve, x: number): EditCurve {
    if (edit.points.some(point => point.x === x)) return edit;
    const y = toCurve(edit).valueAt(x);
    const points = edit.points.map(point => ({ ...point }));
    const index = points.findIndex(point => point.x > x);
    const at = index === -1 ? points.length : index;
    if (points[at - 1]) delete points[at - 1].out;
    if (points[at]) delete points[at].in;
    points.splice(at, 0, { x, y });
    return { ...edit, points };
}

/** The curve with the value at `x` moved by `dy`, adding a point there if
 *  there isn't one. Its handles move with it. */
export function nudge(edit: EditCurve, name: Name, x: number, dy: number): EditCurve {
    const added = addPoint(edit, x);
    const index = pointAt(added, x);
    const points = added.points.map(point => ({ ...point }));
    const point = points[index];
    const y = clampValue(name, point.y + dy);
    const moved = y - point.y;
    point.y = y;
    if (point.in !== undefined) point.in = clampValue(name, point.in + moved);
    if (point.out !== undefined) point.out = clampValue(name, point.out + moved);
    return { ...added, points };
}

/** The curve without its point(s) at `x`, unless that's all it has. */
export function removePoint(edit: EditCurve, x: number): EditCurve {
    const points = edit.points.filter(point => point.x !== x).map(point => ({ ...point }));
    if (points.length === 0) return edit;
    // The segment that now spans the gap is straight.
    const at = points.findIndex(point => point.x > x);
    if (at > 0) delete points[at - 1].out;
    if (at >= 0) delete points[at].in;
    return { ...edit, points };
}

/** How the curves lay out along the knob's angle. They repeat every `period`
 *  degrees (the span of their repeating parts, `loop`). Between `low` and
 *  `high` the knob's angle is shown as it is; past them, on a side that
 *  repeats, it wraps back by whole periods. On a side that doesn't, the view
 *  grows to follow the knob. */
export interface Layout {
    loop: [number, number];
    low: number;
    high: number;
    wrapsLeft: boolean;
    wrapsRight: boolean;
}

/** One value everywhere: it has no say in the layout. */
function isUniform(edit: EditCurve): boolean {
    const [first] = edit.points;
    return edit.flatBefore && edit.flatAfter && edit.points.every(point => point.x === first.x && point.y === first.y);
}

export function layout(config: Config): Layout {
    let loop: [number, number] | undefined;
    for (const name of NAMES) {
        const edit = config[name];
        if (edit.flatBefore && edit.flatAfter) continue;
        const [first, last] = [edit.points[0].x, edit.points[edit.points.length - 1].x];
        if (last > first) loop = loop ? [Math.min(loop[0], first), Math.max(loop[1], last)] : [first, last];
    }
    loop ??= [0, 360];
    const period = loop[1] - loop[0];
    // Only the target can stop the looping: held, it's a global angle, so it
    // pulls from any number of turns away. So does a single target, with a spring.
    const target = config.target;
    const pulls = !(isUniform(config.tension) && config.tension.points[0].y === 0);
    const held = isUniform(target) ? pulls : false;
    const wrapsLeft = !held && !(target.flatBefore && !isUniform(target));
    const wrapsRight = !held && !(target.flatAfter && !isUniform(target));
    // A held end of any other curve is just one value from there on, which
    // repeats as well as anything: the repeats start where it does.
    let right = loop[0], left = loop[1];
    for (const name of NAMES) {
        const edit = config[name];
        if (name === "target" || isUniform(edit)) continue;
        if (edit.flatAfter) right = Math.max(right, edit.points[edit.points.length - 1].x);
        if (edit.flatBefore) left = Math.min(left, edit.points[0].x);
    }
    return { loop, low: left - period, high: right + period, wrapsLeft, wrapsRight };
}

/** Where the knob at global angle `x` is shown: wrapped back by whole
 *  periods on a side where the curves repeat. */
export function shownAngle({ loop, low, high, wrapsLeft, wrapsRight }: Layout, x: number): number {
    const period = loop[1] - loop[0];
    const wrap = (from: number) => from + ((x - from) % period + period) % period;
    if (wrapsRight && x >= high) return wrap(high - period);
    if (wrapsLeft && x < low) return wrap(low);
    return x;
}

/** The x range to show: from `low` to `high`, and past a side that grows,
 *  the cursor and every point. Only a growing side gets a margin. */
export function extent(config: Config, shape: Layout, cursor: number): [number, number] {
    let low = shape.wrapsLeft ? shape.low : shape.loop[0];
    let high = shape.wrapsRight ? shape.high : shape.loop[1];
    for (const name of NAMES) {
        for (const point of config[name].points) {
            if (!shape.wrapsLeft) low = Math.min(low, point.x);
            if (!shape.wrapsRight) high = Math.max(high, point.x);
        }
    }
    if (!shape.wrapsLeft) low = Math.min(low, cursor);
    if (!shape.wrapsRight) high = Math.max(high, cursor);
    const margin = (high - low) * 0.04;
    return [low - (shape.wrapsLeft ? 0 : margin), high + (shape.wrapsRight ? 0 : margin)];
}

/** A curve that's one value everywhere, made to repeat over `loop`, so that
 *  editing it adds to the loop instead of giving it ends. */
export function repeating(edit: EditCurve, loop: [number, number]): EditCurve {
    if (!isUniform(edit)) return edit;
    const y = edit.points[0].y;
    return { points: [{ x: loop[0], y }, { x: loop[1], y }], flatBefore: false, flatAfter: false };
}

/** The y range of a curve: 0..1, or for targets, the angles it pulls to
 *  across the shown range, and its points' values: at least a turn high. */
export function yRange(config: Config, name: Name, shown: [number, number]): [number, number] {
    if (name !== "target") return [0, 1];
    const ys = config.target.points.flatMap(point => [point.y, point.in ?? point.y, point.out ?? point.y]);
    const samples = 64;
    for (let i = 0; i <= samples; i++) ys.push(shownValue(config, "target", shown[0] + (shown[1] - shown[0]) * i / samples));
    const low = Math.min(...ys);
    return [low, Math.max(low + 360, ...ys)];
}

/** What the graph draws for a curve at `x`: for the target, the angle the
 *  knob is pulled to there, so repeats join up instead of jumping a turn. */
export function shownValue(config: Config, name: Name, x: number): number {
    const curve = toCurve(config[name]);
    return name === "target" ? curve.targetAt(x) : curve.valueAt(x);
}

// ---- The curve chooser: ready-made shapes for one curve. ----

export const KINDS = ["steps", "ramp", "uniform 0", "uniform 0.25", "uniform 0.5", "uniform 1"] as const;
export type Kind = typeof KINDS[number];

/** A ready-made curve. Targets are angles: steps are 24 detents, the ramp
 *  follows the knob (no pull), and a uniform value is that share of a turn. */
export function kindCurve(name: Name, kind: Kind): EditCurve {
    const target = name === "target";
    if (kind === "steps") {
        if (target) return fromCurve(Curve.steps(24));
        // Four levels across a turn.
        const points = [0, 1, 2, 3].flatMap(level => [{ x: level * 90, y: level / 3 }, { x: (level + 1) * 90, y: level / 3 }]);
        return fromCurve(Curve.points(points));
    }
    if (kind === "ramp") return fromCurve(target ? Curve.ramp(0, 360) : Curve.ramp(0, 1));
    const value = Number(kind.split(" ")[1]);
    return fromCurve(Curve.uniform(target ? value * 360 : value));
}

/** Which ready-made curve this is, if any. */
export function kindOf(name: Name, edit: EditCurve): Kind | "custom" {
    const json = JSON.stringify(edit);
    return KINDS.find(kind => JSON.stringify(kindCurve(name, kind)) === json) ?? "custom";
}
