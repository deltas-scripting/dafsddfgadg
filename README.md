# GunBox

A first-person gore sandbox in the spirit of GoreBox, built with [Three.js](https://threejs.org/) and the
[Rapier](https://rapier.rs/) physics engine. Everything is generated in code: models, textures, sounds and
animations ship without a single asset file.

## What is in it

- **Main menu** with a live 3D backdrop and a **map select** screen with one map, **Polygon**: a walled training
  ground with a shooting range, a kill house, stacked containers and a watchtower.
- **First-person view** with arms, a visible body and shadow, sprinting, crouching and jumping.
- **ToolGun** (your starting item): spawn goredolls where you aim, or delete them again.
- **AK-47**, **Pistol** and **Knife**, each with its own model and draw, fire, recoil, reload, aim and melee
  animations.
- **Goredolls**: blocky characters in random outfits. They have no AI and simply stand there until you get to
  work. Every body part has its own health, can be shot or cut off at the joint, and the doll turns into a
  physics ragdoll when it dies or loses a leg.
- **Blood system**: droplets that fly and splatter on whatever they hit, dripping wall splats, pools that spread
  under bodies, arterial spurts from stumps, wounds on the body, gibs, blood on the knife and on the screen,
  and bloody footprints after you walk through a pool.
- Loose crates to shove around and explosive barrels (three hits and they go up).

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look |
| `Space` | Jump |
| `Shift` | Sprint |
| `C` | Crouch |
| `1`–`4` / mouse wheel | ToolGun, AK-47, Pistol, Knife |
| Left mouse | Spawn goredoll / fire / slash |
| Right mouse | Remove doll / aim down sights / stab |
| `R` | Reload |
| `X` | Clean up the map (dolls, blood, debris) |
| `Esc` | Pause |

## Running it

```bash
npm install
npm run dev      # development server on http://localhost:5173
npm run build    # type-check and build to dist/
npm run preview  # serve the production build
```

## Project layout

```
src/
  main.ts            boot, menu/game state, pointer lock, frame loop
  engine/            geometry builder, procedural textures, materials, lighting, audio, input, physics
  models/            humanoid rig and looks, weapons and first-person arms, props
  game/              player, weapons, goredolls, blood, gibs, effects, the Polygon map
  menu/              3D scene behind the main menu
  ui/                HUD, menus, thumbnail and icon rendering
```

For scripted checks, `?debug` starts the game without pointer lock and exposes `window.__gb`; adding
`&manual` stops the frame loop so frames can be advanced with `__gb.step(n)`, and `&scale=0.5` lowers the
render resolution.
