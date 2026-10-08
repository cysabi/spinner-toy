import assert from "node:assert/strict";
import { test } from "node:test";
import { Curve, Curves } from "@rcade/plugin-input-spinners";
import { addPoint, extent, fromCurve, fromCurves, layout, nextStop, nudge, removePoint, repeating, shownAngle, snapped, toCurve, toCurves, yRange } from "../src/model.ts";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test("library curves survive the round trip through the editor", () => {
    for (const curve of [Curve.uniform(0.3), Curve.steps(8), Curve.ramp(0, 1, { ease: "inOut" }), Curves.wall("left").get("tension")]) {
        const back = toCurve(fromCurve(curve));
        for (let x = -800; x <= 800; x += 7.3) close(back.valueAt(x), curve.valueAt(x));
    }
});

test("a uniform curve is one point that holds everywhere", () => {
    const edit = fromCurve(Curve.uniform(0.5));
    assert.deepEqual(edit, { points: [{ x: 0, y: 0.5 }], flatBefore: true, flatAfter: true });
});

test("the cursor snaps within 3°, and the joystick steps between points", () => {
    const edit = fromCurve(Curve.steps(4)); // jumps at 45, 135, 225, 315
    assert.equal(snapped(edit, 47), 45);
    assert.equal(snapped(edit, 49), undefined);
    assert.equal(nextStop(edit, 46, 1), 135, "on a point, the next one");
    assert.equal(nextStop(edit, 50, -1), 45);
    assert.equal(nextStop(edit, 360, 1), undefined);
});

test("editing off a point adds one there, worth what the curve was", () => {
    const edit = fromCurve(Curve.ramp(0, 1));
    const added = addPoint(edit, 90);
    assert.equal(added.points.length, 3);
    close(added.points[1].y, 0.25);
    const nudged = nudge(edit, "tension", 90, 0.5);
    close(toCurve(nudged).valueAt(90), 0.75);
    close(toCurve(nudge(nudged, "tension", 90, 5)).valueAt(90), 1, );
});

test("at a jump, the later point moves: the value at that angle", () => {
    const edit = fromCurve(Curve.steps(4));
    const moved = nudge(edit, "target", 45, 10);
    close(toCurve(moved).valueAt(45), 100);
    close(toCurve(moved).valueAt(44), 0);
});

test("removing a point keeps at least one", () => {
    const one = fromCurve(Curve.uniform(0.2));
    assert.equal(removePoint(one, 0), one);
    const steps = fromCurve(Curve.steps(4));
    assert.equal(removePoint(steps, 45).points.length, steps.points.length - 2);
});

test("repeating curves loop the view; walls let it grow", () => {
    // Detents repeat over a turn: the knob's angle wraps, and the view is that turn.
    const detents = fromCurves(Curves.detents(24));
    const loop = layout(detents);
    assert.deepEqual(loop, { loop: [0, 360], low: 0, high: 360, wrapsLeft: true, wrapsRight: true });
    assert.equal(shownAngle(loop, 725), 5);
    assert.equal(shownAngle(loop, -10), 350);
    assert.deepEqual(extent(detents, loop, 5), [0, 360]);
    // Only single values: one turn, looping.
    assert.deepEqual(layout(fromCurves(Curves.create())), { loop: [0, 360], low: 0, high: 360, wrapsLeft: true, wrapsRight: true });
    // A wall on the left: that side grows to follow the knob, the right still loops.
    const walled = fromCurves(Curves.detents(24).wall("left"));
    const half = layout(walled);
    assert.equal(half.wrapsLeft, false);
    assert.equal(half.wrapsRight, true);
    assert.equal(shownAngle(half, -500), -500);
    assert.equal(shownAngle(half, 725), 5);
    const [low, high] = extent(walled, half, -500);
    assert.ok(low < -500 && high === 360);
    // Walls both sides: grows both ways.
    const coil = fromCurves(Curves.wall("left").wall("right", { angle: 360 }));
    const both = layout(coil);
    assert.equal(both.wrapsLeft || both.wrapsRight, false);
    assert.equal(shownAngle(both, 900), 900);
    assert.ok(extent(coil, both, 900)[1] > 900);
    assert.ok(toCurves(coil));
});

test("a single value edited inside a loop repeats over it", () => {
    const uniform = fromCurve(Curve.uniform(0.3));
    const looped = repeating(uniform, [0, 360]);
    assert.deepEqual(looped, { points: [{ x: 0, y: 0.3 }, { x: 360, y: 0.3 }], flatBefore: false, flatAfter: false });
    const edited = nudge(looped, "tension", 90, 0.5);
    close(toCurve(edited).valueAt(90 + 360), 0.8);
    assert.equal(repeating(edited, [0, 360]), edited, "only single values change");
});

test("the target's height is what it pulls to, not how far the view grows", () => {
    const coil = fromCurves(Curves.wall("left").wall("right", { angle: 360 }));
    assert.deepEqual(yRange(coil, "target", [-2000, 3000]), [0, 360]);
    assert.deepEqual(yRange(fromCurves(Curves.detents(24)), "target", [0, 360]), [0, 360]);
    assert.deepEqual(yRange(fromCurves(Curves.create()), "target", [0, 360]), [0, 360]);
});

test("grid lines never crowd, however far the view grows", async () => {
    const { gridStep } = await import("../src/render.ts");
    for (const span of [100, 400, 1_000, 2_000, 5_000, 30_000, 400_000, 9_000_000]) {
        const step = gridStep(span);
        assert.ok(span / step <= 6, `${span}: ${step}`);
        assert.ok(span / step > 1.5, `${span}: ${step} is too coarse`);
    }
    assert.equal(gridStep(360), 90);
    assert.equal(gridStep(2_000), 360);
    assert.equal(gridStep(5_000), 1_800);
});

test("the curve chooser's shapes, and telling them apart", async () => {
    const { KINDS, kindCurve, kindOf } = await import("../src/model.ts");
    for (const name of ["target", "tension"] as const) {
        for (const kind of KINDS) assert.equal(kindOf(name, kindCurve(name, kind, 0.3)), kind, `${name} ${kind}`);
    }
    assert.equal(toCurve(kindCurve("target", "uniform", 90)).valueAt(77), 90);
    assert.equal(kindOf("mass", fromCurve(Curve.uniform(0.42))), "uniform", "any single value is uniform");
    assert.equal(toCurve(kindCurve("tension", "steps")).valueAt(200), 2 / 3);
    assert.equal(kindOf("tension", fromCurve(Curve.ramp(0, 0.7))), "custom");
});

test("a single target with a spring is global: nothing loops", () => {
    assert.equal(layout(fromCurves(Curves.target(90).tension(0.5))).wrapsRight, false);
    assert.equal(layout(fromCurves(Curves.target(90))).wrapsRight, true, "without a spring it doesn't pull");
});
