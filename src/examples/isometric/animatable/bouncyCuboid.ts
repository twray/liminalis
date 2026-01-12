import { easeInBounce } from "easing-utils";
import { midiVisual } from "../../../core";

// NOTE: This example is disabled until isometric animation support is added
// The new .to() animation API currently only supports 2D shape primitives
export const bouncyCuboid = () => {
  return midiVisual<{
    positionIndex: number;
  }>().withRenderer(
    ({ props, renderIsometric, attackValue, releaseFactor }) => {
      const { positionIndex } = props;

      const adjustedAttackValue = easeInBounce(attackValue);

      renderIsometric(({ cuboid }) => {
        cuboid({
          isoX: -3 + positionIndex,
          isoY: 0,
          isoZ: -6 + positionIndex,
          lengthX: 1,
          lengthY: 3,
          lengthZ: 1,
          fill: "#333",
          opacity: releaseFactor,
          translateZ: 0, // Animation disabled - would need .to() API for isometric
        });
      });
    }
  );
};
