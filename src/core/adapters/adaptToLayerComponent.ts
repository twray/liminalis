import { LayerComponent, ReactiveLayerComponent } from "../../render";
import ReactiveLayerEnvelope from "../ReactiveLayerEnvelope";

export const adaptToLayerComponent = (
  reactiveComponent: ReactiveLayerComponent<any>,
  state: ReactiveLayerEnvelope,
): LayerComponent<any> => {
  const { current, timeOf } = state;

  return {
    props: reactiveComponent.props,
    render: (ambient) =>
      reactiveComponent.render({
        ...ambient,
        current,
        timeOf,
      }),
  };
};
