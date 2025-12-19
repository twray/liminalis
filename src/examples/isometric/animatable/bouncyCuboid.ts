import { easeInBounce, easeOutBack } from "easing-utils";
import { animatableIsometric } from "../../../core";

export const bouncyCuboid = () => {
  return animatableIsometric<{
    positionIndex: number;
  }>().withRenderer(
    ({ props, context, attackValue, releaseFactor, animate }) => {
      const { positionIndex } = props;

      const adjustedAttackValue = easeInBounce(attackValue);

      context.addCuboidAt({
        isoX: -3 + positionIndex,
        isoY: 0,
        isoZ: -6 + positionIndex,
        lengthX: 1,
        lengthY: 3,
        lengthZ: 1,
        fill: "#333",
        opacity:
          releaseFactor === 1
            ? animate({ from: 1, to: 0, duration: 500 })
            : releaseFactor,
        translateZ: animate({
          duration: 1000,
          from: 750 * adjustedAttackValue,
          to: 0,
          easing: easeOutBack,
        }),
      });
    }
  );
};
