import { PropsFirstFactory } from "../../types";
import Visual, { VisualRenderer } from "../Visual";

export type VisualComponent<TProps> = PropsFirstFactory<TProps, Visual<TProps>>;

export const visual = <TProps = {}>(
  renderer: VisualRenderer<TProps>,
): VisualComponent<TProps> => {
  const factory = (props?: TProps) => new Visual<TProps>(props, renderer);
  return factory as VisualComponent<TProps>;
};
