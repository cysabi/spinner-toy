# `spinner-toy`
> draw how a knob feels, then feel it

an rcade game for shaping the t-knob's haptics live. the left spinner is the knob you're feeling, the right one edits its curves.
- four curves: target, tension, mass, friction
- presets from plain detents to coils that wind up and spin forever
- every rumble preset from web-haptics, one button away

## usage
- **left joystick ▲▼** picks a section. **◀▶** steps it
- **left spinner** moves the cursor. **right spinner** edits the shown curve there, adding a point if there isn't one. **b** deletes it
- **a** tares on the preset row, and plays the rumble elsewhere
- **p2's a** tares

editing anything makes the preset or curve **custom**.

| preset | feel |
|---|---|
| stock | motor off |
| detents | 24 per turn |
| detents & tension ramp | springs fading from full to none over four turns |
| mass ramp | mass rising over four turns |
| friction ramp | friction rising over four turns |
| coil | walls meeting at 0: wind it either way, it springs back |
| coil & tension steps | the coil, harder a step every quarter turn |
| flywheel | mass 0.5, friction 0 |
| wheee | the target always 10° ahead: it spins forever |

## local setup
- `pnpm i`
- `pnpm dev`
### building for production
- `pnpm build`

---

*empathy included • [**@cysabi**](https://github.com/cysabi) • [cysabi.github.io](https://cysabi.github.io)*
