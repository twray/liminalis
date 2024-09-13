import Mode from "./Mode";

class ModeManager {
  constructor(modeTransitionNote) {
    this.modeTransitionNote = modeTransitionNote;
    this.currentModeIndex = 0;
    this.timestampSinceTransitionToNewMode = null;

    this.modesInOrder = [
      Mode.DARK,
      Mode.TRANSITION_TO_BLOCK,
      Mode.BLOCK,
    ];
  };

  getCurrentMode() {
    const { modesInOrder } = this;
    return modesInOrder[this.currentModeIndex];
  }

  getTimeSinceTransitionMode() {
    const { timestampSinceTransitionToNewMode } = this;
    return new Date().getTime() - timestampSinceTransitionToNewMode;
  }

  transitionToNextMode() {
    const { modesInOrder } = this;
    
    if (this.currentModeIndex < (modesInOrder.length - 1)) {
      this.currentModeIndex++;
    }

    const newlyTransitionedMode = this.getCurrentMode();

    if (newlyTransitionedMode === Mode.TRANSITION_TO_BLOCK) {
      this.timestampSinceTransitionToNewMode = new Date().getTime();
    }

    console.log(`Transitioning to mode: ${newlyTransitionedMode}`);
  }
}

export default ModeManager;