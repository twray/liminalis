export interface PositionalIdentity {
  // Distinguishes primitives that share a positional slot but are not the
  // same kind of thing -- a conditional rendering a rect on one frame and a
  // circle on the next would otherwise resolve to the same slot, and the
  // circle would inherit the rect's animation state (including its creation
  // time, so its own entrance animation would be evaluated as already over).
  // Omitted means legacy, un-qualified positional identity.
  primitiveType?: string;
  // Opt-in stable identity. When supplied, this primitive is identified by
  // the key rather than by where it sits in declaration order, and it does
  // NOT consume a positional index -- exactly how withScope already treats
  // an explicit key for containers. Needed whenever declaration order can
  // change between frames (prepend/insert/remove-from-middle/sort).
  key?: string;
}
