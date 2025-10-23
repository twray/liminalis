import Mode from "../util/Mode.js";

export default class ModeManager {
  public modeTransitionNotes: string[];
  private currentModeIndex: number = 0;
  private timestampSinceTransitionToNewMode: number | null = null;
  private modes: string[];

  constructor(modes: string[], modeTransitionNotes: string[]) {
    this.modes = modes;
    this.modeTransitionNotes = modeTransitionNotes;
  }

  currentlyIsOrPreviouslyHasBeenInMode(mode: string): boolean {
    const { modes: modesInOrder, currentModeIndex } = this;
    const indexOfModeToSearch = modesInOrder.indexOf(mode);

    return (
      indexOfModeToSearch !== -1 && indexOfModeToSearch <= currentModeIndex
    );
  }

  getPreviousMode() {
    const { modes: modesInOrder, currentModeIndex } = this;
    return currentModeIndex > 0 ? modesInOrder[currentModeIndex - 1] : null;
  }

  getCurrentMode() {
    const { modes: modesInOrder, currentModeIndex } = this;
    return modesInOrder[currentModeIndex];
  }

  getTimeSinceTransitionMode(): number {
    const { timestampSinceTransitionToNewMode } = this;
    if (timestampSinceTransitionToNewMode === null) {
      return 0;
    }
    return new Date().getTime() - timestampSinceTransitionToNewMode;
  }

  transitionToNextMode() {
    const { modes: modesInOrder } = this;

    if (this.currentModeIndex >= modesInOrder.length - 1) {
      return;
    }

    this.currentModeIndex++;

    const newlyTransitionedMode = this.getCurrentMode();

    if (
      [
        Mode.TRANSITION_TO_BLOCK,
        Mode.TRANSITION_BACK_TO_DARKNESS,
        Mode.FINAL_BLOCK,
      ].includes(newlyTransitionedMode as any)
    ) {
      this.timestampSinceTransitionToNewMode = new Date().getTime();
    }

    console.log(`Transitioning to mode: ${newlyTransitionedMode}`);
  }
}
