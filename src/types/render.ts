import { DrawMethods, PlaceOptions, ReactiveLayerComponent } from "../render";
import { NormalizedFloat } from "./common";

// Every DrawMethods member is designed to be exposed to renderable
// callbacks (onRender, visual()), so RenderProps extends it directly rather
// than hand-copying members one by one — a prior version did that, and it
// silently fell out of sync with DrawMethods (missing newly-added
// primitives like place()) since nothing enforced the two stayed aligned.
export interface RenderProps extends DrawMethods {
  context: CanvasRenderingContext2D;
  hasMeasurements: true;
  time: number;
  placeInScene: (
    component: ReactiveLayerComponent<any>,
    options: PlaceOptions,
    id: string,
  ) => void;
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
