# `spinner-toy`
> play with the haptics on the spinner :)

an rcade game for playing with the t-knob's haptics live.
- visualize and change all 4 curves. target, tension, mass, friction
- many presets. detents, coils, etc
- rumble presets with the same api as https://haptics.lochie.me

## usage
- **left joystick ▲▼** picks a section. **◀▶** steps it
- **left spinner** moves the cursor. **right spinner** edits the shown curve there, adding a point if there isn't one. **b** deletes it
- **a** to tare or rumble

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
