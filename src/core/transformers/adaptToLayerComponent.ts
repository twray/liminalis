import { LayerComponent, ReactiveLayerComponent } from "../../render";
import ReactiveLayerEnvelope from "../ReactiveLayerEnvelope";

export const adaptToLayerComponent = (
  reactiveComponent: ReactiveLayerComponent<any>,
  state: ReactiveLayerEnvelope,
): LayerComponent<any> => {
  const { status, attackValue, releasePeriod } = state;
  const timeAttacked = state.msSinceAttacked;
  const timeReleased = state.msSinceReleased;

  return {
    props: reactiveComponent.props,
    render: (ambient) =>
      reactiveComponent.render({
        ...ambient,
        status,
        attackValue,
        releasePeriod,
        timeAttacked,
        timeReleased,
      }),
  };
};
