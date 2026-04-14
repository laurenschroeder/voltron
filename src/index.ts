import { SessionMode, World } from "@iwsdk/core";

import { GameSystem } from "./game.js";
import { PlayerSystem } from "./player.js";
import { TrackSystem } from "./track.js";
import { OrbSystem } from "./orb.js";
import { ObstacleSystem } from "./obstacle.js";
import { HUDSystem } from "./hud.js";

World.create(
  document.getElementById("scene-container") as HTMLDivElement,
  {
    // No external assets — all geometry is procedural
    assets: {},
    xr: {
      sessionMode: SessionMode.ImmersiveVR,
      offer: "always",
      features: { handTracking: true, layers: true },
    },
    features: {
      locomotion: false,
      grabbing: false,
      physics: false,
      sceneUnderstanding: false,
      environmentRaycast: false,
    },
  }
).then((world) => {
  // Non-XR camera: first-person view looking straight down the track (-Z)
  world.camera.position.set(0, 1.5, 1.0);
  world.camera.lookAt(0, 1.5, -10);

  // Register systems in execution order
  world
    .registerSystem(GameSystem)    // score / energy / blast timer
    .registerSystem(PlayerSystem)  // input → lane / duck state
    .registerSystem(TrackSystem)   // scrolling floor
    .registerSystem(OrbSystem)     // orb pool: spawn, move, collect
    .registerSystem(ObstacleSystem) // obstacle pool: spawn, move, collide
    .registerSystem(HUDSystem);    // UI panel + 3D BLAST button
});
