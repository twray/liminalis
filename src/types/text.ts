import type { SizeUnit } from "./css";

export type FontStyle =
  | "normal"
  | "italic"
  | "oblique"
  | `oblique ${number}deg`;

export type FontWeight =
  | "normal"
  | "bold"
  | "bolder"
  | "lighter"
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900;

export type FontSize = `${number}${SizeUnit}`;
