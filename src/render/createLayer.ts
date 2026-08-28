import type { LayerComponent, LayerRenderer } from "./types";

type PropsFirstFactory<TProps, TInstance> = {} extends TProps
  ? (props?: TProps) => TInstance
  : (props: TProps) => TInstance;

export type LayerFactory<TProps> = PropsFirstFactory<
  TProps,
  LayerComponent<TProps>
>;

// createLayer bundles a typed render function with its props into a
// LayerComponent that can be instantiated anywhere via place() — inside the
// top-level onRender, inside a group()/layer(), or inside another component.
// It needs no framework plumbing of its own: place() (built on the same
// createContainerPrimitive engine as group()/layer()) is what supplies the
// ambient DrawMethods at invocation time, since the component's render
// function is defined in its own module, before any frame/draw context
// exists to close over.
export const createLayer = <TProps = {}>(
  renderer: LayerRenderer<TProps>,
): LayerFactory<TProps> => {
  const factory = (props?: TProps): LayerComponent<TProps> => ({
    props: props as TProps,
    render: (ambient) => renderer({ ...ambient, props: props as TProps }),
  });

  return factory as LayerFactory<TProps>;
};

export default createLayer;
