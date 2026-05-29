import Visual, { VisualRenderer } from "./Visual";

type PropsFirstFactory<TProps, TInstance> = {} extends TProps
  ? (props?: TProps) => TInstance
  : (props: TProps) => TInstance;

export type VisualComponent<TProps> = PropsFirstFactory<TProps, Visual<TProps>>;

export const defineVisual = <TProps = {}>(
  renderer: VisualRenderer<TProps>,
): VisualComponent<TProps> => {
  const factory = (props?: TProps) => new Visual<TProps>(props, renderer);
  return factory as VisualComponent<TProps>;
};
