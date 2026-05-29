import MidiVisual, { MidiVisualRenderProps } from "./MidiVisual";
import Visual, { VisualRenderProps } from "./Visual";

type PropsFirstFactory<TProps, TInstance> = {} extends TProps
  ? (props?: TProps) => TInstance
  : (props: TProps) => TInstance;

export type VisualComponent<TProps> = PropsFirstFactory<TProps, Visual<TProps>>;
export type MidiVisualComponent<TProps> = PropsFirstFactory<
  TProps,
  MidiVisual<TProps>
>;

export const defineVisual = <TProps = {}>(
  renderer: (params: VisualRenderProps<TProps>) => void,
): VisualComponent<TProps> => {
  const factory = (props?: TProps) =>
    new Visual<TProps>(props).withRenderer(renderer);

  return factory as VisualComponent<TProps>;
};

export const defineMidiVisual = <TProps = {}>(
  renderer: (params: MidiVisualRenderProps<TProps>) => void,
): MidiVisualComponent<TProps> => {
  const factory = (props?: TProps) =>
    new MidiVisual<TProps>(props).withRenderer(renderer);

  return factory as MidiVisualComponent<TProps>;
};
