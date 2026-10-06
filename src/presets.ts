import { Curve, Curves } from "@rcade/plugin-input-spinners";
import { fromCurves, kindCurve, type Config } from "./model.ts";

export interface Preset {
    name: string;
    create(): Config;
}

/** Four turns, for the ramps. */
const FOUR_TURNS: [number, number] = [0, 4 * 360];

export const PRESETS: Preset[] = [
    // The motor-off feel: no mass, no spring, the knob's own friction.
    { name: "stock", create: () => fromCurves(Curves.create()) },
    { name: "detents", create: () => fromCurves(Curves.detents(24)) },
    // The same detents, from full spring at 0° down to none four turns on.
    { name: "detents & tension ramp", create: () => fromCurves(Curves.detents(24).tension(Curve.ramp(1, 0, { angle: FOUR_TURNS }))) },
    { name: "mass ramp", create: () => fromCurves(Curves.mass(Curve.ramp(0, 1, { angle: FOUR_TURNS }))) },
    { name: "friction ramp", create: () => fromCurves(Curves.friction(Curve.ramp(0, 1, { angle: FOUR_TURNS }))) },
    // Walls on both sides, meeting at 0: wind it either way and it springs back.
    { name: "coil", create: () => fromCurves(Curves.wall("left", { angle: 0 }).wall("right", { angle: 0 })) },
    // The coil's pull back to 0, its strength stepping up a level every quarter turn.
    { name: "coil & tension steps", create: () => ({ ...config("coil"), tension: kindCurve("tension", "steps") }) },
    { name: "flywheel", create: () => fromCurves(Curves.mass(0.5).friction(0)) },
    // The target is always 10° ahead, so it spins forever. It needs some
    // tension to pull at all; a quarter spins it briskly without slamming.
    { name: "wheee", create: () => fromCurves(Curves.target(Curve.ramp(10, 370)).tension(0.25)) },
];

/** A preset's curves, by name. */
function config(name: string): Config {
    return PRESETS.find(preset => preset.name === name)!.create();
}
