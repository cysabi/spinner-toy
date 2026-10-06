import assert from "node:assert/strict";
import { test } from "node:test";
import { curvesToWire } from "@rcade/plugin-input-spinners";
import { layout, toCurves } from "../src/model.ts";
import { PRESETS } from "../src/presets.ts";

const config = (name: string) => PRESETS.find(item => item.name === name)!.create();
const preset = (name: string) => toCurves(config(name));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test("every preset fits on the wire", () => {
    for (const { name, create } of PRESETS) {
        const wire = JSON.stringify(curvesToWire(toCurves(create())));
        assert.ok(wire.length < 65_536, name);
    }
});

test("stock is the motor-off feel", () => {
    const stock = preset("stock");
    for (const x of [-1000, 0, 123]) {
        assert.equal(stock.get("mass").valueAt(x), 0);
        assert.equal(stock.get("tension").valueAt(x), 0);
        assert.equal(stock.get("friction").valueAt(x), 0.5);
    }
});

test("detents pull to 24 detents; with tension falling over four turns", () => {
    const detents = preset("detents");
    assert.equal(detents.get("target").targetAt(16), 15);
    assert.equal(detents.get("target").targetAt(360 * 3 + 2), 360 * 3);
    const falling = preset("detents & tension ramp");
    near(falling.get("tension").valueAt(0), 1);
    near(falling.get("tension").valueAt(1080), 0.25);
    assert.equal(falling.get("target").targetAt(16), 15);
    assert.deepEqual(layout(config("detents & tension ramp")).loop, [0, 1440], "the view loops over the four turns");
});

test("mass and friction rise over four turns", () => {
    for (const name of ["mass", "friction"] as const) {
        const curves = preset(`${name} ramp`);
        near(curves.get(name).valueAt(0), 0);
        near(curves.get(name).valueAt(1080), 0.75);
        near(curves.get(name).valueAt(1440 + 360), 0.25);
    }
});

test("coil springs back to 0 from either side, and the view grows", () => {
    const coil = preset("coil");
    for (const x of [-900, -5, 5, 900]) {
        assert.equal(coil.get("tension").valueAt(x), 1);
        assert.equal(coil.get("target").targetAt(x), 0);
    }
    const shape = layout(config("coil"));
    assert.equal(shape.wrapsLeft || shape.wrapsRight, false);
});

test("coil & tension steps: pulled back to 0, harder a step every quarter turn", () => {
    const curves = preset("coil & tension steps");
    for (const x of [-900, 45, 900]) assert.equal(curves.get("target").targetAt(x), 0);
    near(curves.get("tension").valueAt(45), 0);
    near(curves.get("tension").valueAt(135), 1 / 3);
    near(curves.get("tension").valueAt(360 + 315), 1);
    near(curves.get("tension").valueAt(-45), 1);
    near(curves.get("friction").valueAt(0), 1);
    near(curves.get("friction").valueAt(90), 0.5);
    near(curves.get("friction").valueAt(-270), 0);
    const shape = layout(config("coil & tension steps"));
    assert.equal(shape.wrapsLeft || shape.wrapsRight, false, "pulled from any distance: the view grows");
});

test("flywheel and wheee", () => {
    const flywheel = preset("flywheel");
    assert.equal(flywheel.get("mass").valueAt(5), 0.5);
    assert.equal(flywheel.get("friction").valueAt(5), 0);
    const wheee = preset("wheee");
    for (const x of [-700, 0, 180, 359, 5000]) near(wheee.get("target").targetAt(x), x + 10);
});
