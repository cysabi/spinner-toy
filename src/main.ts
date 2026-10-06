import { P1, P2, rumblePresets } from "@rcade/plugin-input-spinners";
import { on as onInput } from "@rcade/plugin-input-classic";
import { KINDS, NAMES, extent, kindCurve, kindOf, layout, nudge, removePoint, repeating, shownAngle, shownValue, snapped, toCurves, type Config, type EditCurve, type Kind, type Name } from "./model.ts";
import { PRESETS } from "./presets.ts";
import { COLORS, Graph } from "./render.ts";
import "./style.css";


/** How far a value moves per degree of the right spinner: one turn is the
 *  whole 0..1 range, or 360° of target. */
const PER_DEGREE: Record<Name, number> = { target: 1, tension: 1 / 360, mass: 1 / 360, friction: 1 / 360 };
/** Mouse drags: degrees of the right spinner per pixel. */
const DRAG_DEGREES_PER_PIXEL = 2;
/** How fast the graph's zoom follows the cursor, per frame. */
const ZOOM_EASE = 0.2;
/** How long a knob error shows in the top bar, ms. */
const MESSAGE_MS = 3_000;
/** No movement for this long reads as stopped, ms. */
const STILL_MS = 100;

const SECTIONS = ["graph", "preset", "curve", "rumble"] as const;
/** The rumbles to try: web-haptics' presets. */
const RUMBLES = Object.keys(rumblePresets);
type Section = typeof SECTIONS[number];

/** The arrows either side of a choice. */
const LEFT = `<span class="arrow" data-step="-1">&lt;</span>`;
const RIGHT = `<span class="arrow" data-step="1">&gt;</span>`;

/** A row that steps through a list: [label 3/9      < name >]. */
function chooser(id: string, hint = ""): string {
    return `
    <section class="panel row" id="${id}">
        <span class="label">${id} <span class="count"></span>${hint && `  <span class="hint">${hint}</span>`}</span>
        <span class="chooser">${LEFT} <span class="choice"></span> ${RIGHT}</span>
    </section>`;
}

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = `
    <section class="panel" id="graph">
        <header id="top">
            <span><span class="label">a:</span> <span class="value" id="angle"></span></span>
            <span><span class="label">g:</span> <span class="value" id="global-angle"></span></span>
            <span><span class="label">v:</span> <span class="value velocity" id="velocity"></span></span>
            <span><span class="label">y:</span> <span class="value short" id="curve-value"></span></span>
            <div class="curve"><span class="label">c:</span> <span class="chooser">${LEFT} <span id="showing"></span> ${RIGHT}</span></div>
            <span id="message"></span>
        </header>
        <svg id="plot"></svg>
        <span class="hint" id="graph-hint">(b to delete)</span>
    </section>
    ${chooser("preset", "(a to tare)")}
    ${chooser("curve")}
    ${chooser("rumble", "(a to play)")}`;

function element<T extends Element = HTMLElement>(selector: string): T {
    return app.querySelector<T>(selector)!;
}

const graph = new Graph(element<SVGSVGElement>("#plot"));

let section: Section = "graph";
let active: Name = "target";
/** Which preset is showing: an index into PRESETS, or -1 for custom. */
let presetIndex = 0;
let config: Config = PRESETS[0].create();
/** The last edited curves, kept while browsing presets. */
let custom: Config | undefined;
/** Each curve's last custom shape, kept while browsing ready-made ones. */
const customCurves: Partial<Record<Name, EditCurve>> = {};
/** The left knob's global angle, in degrees. */
let cursor = 0;
let velocity = 0;
let movedAt = 0;
let range = extent(config, layout(config), cursor);
let message = "";
let messageUntil = 0;

function say(error: unknown): void {
    message = error instanceof Error ? error.message : String(error);
    messageUntil = performance.now() + MESSAGE_MS;
}

// ---- Sending: the left knob feels the curves being edited. ----

let sending = false;
let dirty = false;

function send(): void {
    if (sending) { dirty = true; return; }
    sending = true;
    dirty = false;
    P1.setCurves(toCurves(config)).catch(say).finally(() => {
        sending = false;
        if (dirty) send();
    });
}

function setConfig(next: Config, edited: boolean): void {
    config = next;
    if (edited) {
        custom = config;
        presetIndex = -1;
    }
    send();
}

// ---- Actions, from the cabinet's controls or the mouse. ----

/** Step through a list that may start with "custom" (-1). */
function cycle<T>(list: T[], current: T, step: -1 | 1): T {
    return list[(list.indexOf(current) + step + list.length) % list.length];
}

/** The presets to step through: custom first, once there is one. */
function presetChoices(): number[] {
    return custom ? [-1, ...PRESETS.keys()] : [...PRESETS.keys()];
}

/** The ready-made curves to step through, after the last custom one. */
function curveChoices(): (Kind | "custom")[] {
    return customCurves[active] || kindOf(active, config[active]) === "custom" ? ["custom", ...KINDS] : [...KINDS];
}


function choosePreset(step: -1 | 1): void {
    presetIndex = cycle(presetChoices(), presetIndex, step);
    setConfig(presetIndex === -1 ? custom! : PRESETS[presetIndex].create(), false);
}

function chooseCurve(step: -1 | 1): void {
    const current = kindOf(active, config[active]);
    if (current === "custom") customCurves[active] = config[active];
    const next = cycle(curveChoices(), current, step);
    setConfig({ ...config, [active]: next === "custom" ? customCurves[active]! : kindCurve(active, next) }, true);
}

function chooseActive(step: -1 | 1): void {
    active = cycle([...NAMES], active, step);
}

/** Put the cursor somewhere. The knob is told it's there too, so what it
 *  feels and what's drawn stay the same place. */
function moveCursor(angle: number): void {
    cursor = angle;
    if (P1.connected) P1.tare(angle).catch(say);
}

/** Where the cursor is shown: the knob's angle, wrapped into the curves'
 *  loop where they repeat. */
function here(): number {
    return shownAngle(layout(config), cursor);
}

function edit(degrees: number): void {
    const shape = layout(config);
    // A single value inside a loop starts repeating over it, so it loops too.
    const curve = shape.wrapsLeft || shape.wrapsRight ? repeating(config[active], shape.loop) : config[active];
    // On a point, that point; otherwise a new one at the cursor.
    const x = snapped(curve, here()) ?? here();
    setConfig({ ...config, [active]: nudge(curve, active, x, degrees * PER_DEGREE[active]) }, true);
}

function deletePoint(): void {
    const x = snapped(config[active], here());
    if (x !== undefined) setConfig({ ...config, [active]: removePoint(config[active], x) }, true);
}

let rumbleIndex = 0;

function chooseRumble(step: -1 | 1): void {
    rumbleIndex = (rumbleIndex + step + RUMBLES.length) % RUMBLES.length;
}

/** Play the chosen rumble on the knob. */
function playRumble(): void {
    P1.rumble(RUMBLES[rumbleIndex]);
}

function joystick(button: string): void {
    const vertical = button === "UP" ? -1 : button === "DOWN" ? 1 : 0;
    if (vertical) {
        section = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, SECTIONS.indexOf(section) + vertical))];
        return;
    }
    const horizontal = button === "LEFT" ? -1 : button === "RIGHT" ? 1 : 0;
    if (!horizontal) return;
    if (section === "graph") chooseActive(horizontal);
    else if (section === "preset") choosePreset(horizontal);
    else if (section === "curve") chooseCurve(horizontal);
    else chooseRumble(horizontal);
}

onInput("press", ({ player, button, type }) => {
    if (type !== "button") return;
    if (player === 2 && button === "A") return moveCursor(0);
    if (player !== 1) return;
    if (button === "A" && section === "preset") moveCursor(0);
    else if (button === "A") playRumble();
    else if (button === "B" && section === "graph") deletePoint();
    else joystick(button);
});

// The cursor is where the knob is.
P1.subscribe(event => {
    cursor = event.globalAngle;
    velocity = event.velocity;
    movedAt = performance.now();
});
// The right spinner edits.
P2.subscribe(event => edit(event.deltaAngle));

/** Whether the knob has been told where the cursor is since it connected. */
let placed = false;

/** A knob that just connected starts wherever its global angle was: put it
 *  at the cursor instead, so the drawing and the knob agree. */
function placeKnob(): void {
    if (!P1.connected) { placed = false; return; }
    if (placed) return;
    placed = true;
    P1.tare(cursor).catch(error => { placed = false; say(error); });
}

// ---- Mouse: a fallback for development. Click to choose; on the graph,
// click to put the cursor there and drag up and down to edit. ----

// The curve's name, or either of its arrows, switches curve.
element("#top .curve").addEventListener("pointerdown", event => {
    section = "graph";
    const arrow = (event.target as Element).closest<HTMLElement>(".arrow");
    chooseActive(arrow?.dataset.step === "-1" ? -1 : 1);
});
for (const [id, choose] of [["preset", choosePreset], ["curve", chooseCurve], ["rumble", chooseRumble]] as const) {
    element(`#${id}`).addEventListener("pointerdown", event => {
        section = id;
        const target = event.target as Element;
        const arrow = target.closest<HTMLElement>(".arrow");
        if (arrow) return choose(arrow.dataset.step === "-1" ? -1 : 1);
        // The rumble's name plays it.
        if (id === "rumble" && target.closest(".choice")) return playRumble();
        const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
        choose(event.clientX < box.left + box.width / 2 ? -1 : 1);
    });
}

let drag: { y: number; pointer: number } | undefined;
// On the plot itself, not the bar above it.
const graphPanel = element("#plot");

graphPanel.addEventListener("pointerdown", event => {
    section = "graph";
    const angle = graph.angleAt(range, event.clientX);
    moveCursor(snapped(config[active], angle) ?? angle);
    drag = { y: event.clientY, pointer: event.pointerId };
    graphPanel.setPointerCapture(event.pointerId);
});

graphPanel.addEventListener("pointermove", event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    // Screen pixels to CSS pixels: the cabinet scales the page.
    const pixels = (drag.y - event.clientY) * app.clientHeight / app.getBoundingClientRect().height;
    if (Math.abs(pixels) < 1) return;
    drag.y = event.clientY;
    edit(pixels * DRAG_DEGREES_PER_PIXEL);
});

const release = (event: PointerEvent) => {
    if (drag?.pointer !== event.pointerId) return;
    drag = undefined;
    if (graphPanel.hasPointerCapture(event.pointerId)) graphPanel.releasePointerCapture(event.pointerId);
};
graphPanel.addEventListener("pointerup", release);
graphPanel.addEventListener("pointercancel", release);

// ---- Every frame. ----

const showing = element("#showing");
const top = element("#top");
const messageLine = element("#message");
const graphHint = element("#graph-hint");
const angleText = element("#angle");
const globalText = element("#global-angle");
const velocityText = element("#velocity");
const curveValue = element("#curve-value");
/** Show a chooser's current choice, and where it is in the list. */
function showChoice(id: string, name: string, index: number, count: number): void {
    element(`#${id} .choice`).textContent = name;
    element(`#${id} .count`).textContent = `${index + 1}/${count}`;
}

function frame(now: number): void {
    placeKnob();
    const shown = here();
    // Zoom out smoothly when the cursor or a point goes past the shown range.
    const goal = extent(config, layout(config), shown);
    range = [range[0] + (goal[0] - range[0]) * ZOOM_EASE, range[1] + (goal[1] - range[1]) * ZOOM_EASE];
    if (Math.abs(range[0] - goal[0]) < 1e-3 && Math.abs(range[1] - goal[1]) < 1e-3) range = goal;

    for (const name of SECTIONS) element(`#${name}`).classList.toggle("focused", section === name);
    showing.textContent = active;
    showing.style.color = COLORS[active];
    // The shown curve's value at the cursor: 0 to 1, or a target's angle.
    const value = shownValue(config, active, shown);
    curveValue.textContent = active === "target" ? `${Math.round(value)}°` : value.toFixed(2);
    curveValue.style.color = COLORS[active];
    app.style.setProperty("--accent", COLORS[active]);
    if (now > messageUntil) message = "";
    if (now - movedAt > STILL_MS) velocity = 0;
    const { angle, globalAngle } = P1.read();
    // An error shows in place of the numbers for a moment.
    // A message covers the bar for a moment.
    messageLine.textContent = message || (P1.connected ? "" : "no knob");
    top.classList.toggle("message", Boolean(messageLine.textContent));
    angleText.textContent = `${angle.toFixed(1)}°`;
    globalText.textContent = `${globalAngle.toFixed(1)}°`;
    // Rounded first, so a crawl backwards reads 0, not -0.
    velocityText.textContent = `${Math.round(velocity) || 0}°`;
    const presets = presetChoices();
    showChoice("preset", presetIndex === -1 ? "custom" : PRESETS[presetIndex].name, presets.indexOf(presetIndex), presets.length);
    const curves = curveChoices();
    const kind = kindOf(active, config[active]);
    showChoice("curve", kind, curves.indexOf(kind), curves.length);
    showChoice("rumble", RUMBLES[rumbleIndex], rumbleIndex, RUMBLES.length);

    const snap = snapped(config[active], shown);
    graphHint.hidden = section !== "graph" || snap === undefined;
    graph.render({ config, active, cursor: shown, range, snap });
    requestAnimationFrame(frame);
}

send();
requestAnimationFrame(frame);
