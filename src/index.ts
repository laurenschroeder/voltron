import { SessionMode, World } from "@iwsdk/core";

import { GameSystem } from "./game.js";
import { ScannerSystem } from "./scanner.js";
import { HUDSystem } from "./hud.js";

World.create(
  document.getElementById("scene-container") as HTMLDivElement,
  {
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
  },
).then((world) => {
  world.camera.position.set(0, 1.5, 0);
  world.camera.lookAt(0, 1.5, -5);

  world
    .registerSystem(GameSystem)    // minimal stub
    .registerSystem(ScannerSystem) // camera capture + Claude analysis
    .registerSystem(HUDSystem);    // scan button + score display
});
