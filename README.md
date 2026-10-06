# Spinner Toy

Draw how the left T-Knob feels, and feel it as you go. An RCade game for the
cabinet's 336×262 screen, two joysticks, two spinners and four buttons. The
mouse works too.

```bash
pnpm install
pnpm dev
```

## Play

```
┌ a: 270.4°   g: 3510.4°   v: 0°   y: 630°         c: < target > ┐
│ the graph: all four curves, the one shown in front               │
└──────────────────────────────────────────────────────────────────┘
[ preset 2/9                                         < detents >  ]
[ curve 1/6                                            < steps >  ]
[ rumble 1/11                                        < success >  ]
```

`a` is the angle in the turn, `g` the global angle, `v` degrees per second,
`y` the shown curve at the cursor, `c` the shown curve.

- **Left joystick ▲▼** picks a section. **◀▶** steps it.
- **Left spinner** is the cursor. **Right spinner** edits the shown curve
  there, adding a point if there isn't one. **B** deletes it.
- **A** tares on the preset row, and plays the rumble elsewhere.
- **P2's A** tares.

Editing anything makes the preset or curve **custom**.

| Preset | Feel |
|---|---|
| stock | Motor off. |
| detents | 24 per turn. |
| detents & tension ramp | Springs fading from full to none over four turns. |
| mass ramp | Mass rising over four turns. |
| friction ramp | Friction rising over four turns. |
| coil | Walls meeting at 0: wind it either way, it springs back. |
| coil & tension steps | The coil, harder a step every quarter turn. |
| flywheel | Mass 0.5, friction 0. |
| wheee | The target always 10° ahead: it spins forever. |

## Checks

```bash
pnpm check
pnpm test
pnpm build
```
