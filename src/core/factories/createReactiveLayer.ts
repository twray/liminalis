import type {
  ReactiveLayerComponent,
  ReactiveLayerRenderer,
} from "../../render/types";
import type { PropsFirstFactory } from "../../types";

export type ReactiveLayerFactory<TProps> = PropsFirstFactory<
  TProps,
  ReactiveLayerComponent<TProps>
>;

// createReactiveLayer bundles a typed reactive render function with its props
// into a ReactiveLayerComponent that can be instantiated anywhere via
// placeInScene(). The placeInScene() function provides the ambient
// ContainerDrawAPI that are required to make the reactive layer render, while also
// providing an identity so that the reactive layer can be efficiently be updated
// and reacted with in-scene. Crucially, the placeInScene() function is available
// only via the setup() function within a scene, as it requires the scene context
// to function correctly.
export const createReactiveLayer = <TProps = {}>(
  renderer: ReactiveLayerRenderer<TProps>,
): ReactiveLayerFactory<TProps> => {
  const factory = (props?: TProps): ReactiveLayerComponent<TProps> => ({
    __componentKind: "reactiveLayer",
    props: props as TProps,
    render: (ambient) =>
      renderer({ ...ambient, props: props ?? ({} as TProps) }),
  });
  return factory as ReactiveLayerFactory<TProps>;
};

export default createReactiveLayer;
