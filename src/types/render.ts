import { DrawAPI } from "../render";
import { NormalizedFloat } from "./common";

export interface RenderProps extends DrawAPI {
  context: CanvasRenderingContext2D;
  time: number;
}

export type ReactiveStatus = "idle" | "sustained" | "releasing";

export interface ReactiveProps {
  status: ReactiveStatus;
  attackValue: NormalizedFloat;
  releasePeriod: number;
  timeAttacked: number | null;
  timeReleased: number | null;
}

// Generic factory type that takes an optionl props first and returns an
// instance of the component.
export type PropsFirstFactory<TProps, TInstance> = {} extends TProps
  ? (props?: TProps) => TInstance
  : (props: TProps) => TInstance;
