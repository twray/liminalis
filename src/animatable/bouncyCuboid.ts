import { easeInQuad, easeOutBack } from "easing-utils";
import { animatableIsometric } from "../core";

export const bouncyCuboid = () => {
  return animatableIsometric<{
    positionIndex: number;
  }>().withRenderer(
    ({ props, context, attackValue, decayFactor, getAnimationTrajectory }) => {
      const { positionIndex } = props;

      const bounceInAnimationTrajectory = getAnimationTrajectory(
        1000,
        0,
        false,
        easeOutBack
      );

      const adjustedAttackValue = easeInQuad(attackValue);

      context.addCuboidAt({
        isoX: -3 + positionIndex,
        isoY: 0,
        isoZ: -6 + positionIndex,
        lengthX: 1,
        lengthY: 3,
        lengthZ: 1,
        fill: "#333",
        opacity: decayFactor,
        translateZ:
          750 * adjustedAttackValue * (1 - bounceInAnimationTrajectory),
      });
    }
  );
};
