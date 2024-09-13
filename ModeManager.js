import Mode from "./Mode";

class ModeManager {
  constructor(modeTransitionNotes) {
    this.modeTransitionNotes = modeTransitionNotes;
    this.currentModeIndex = 0;
    this.timestampSinceTransitionToNewMode = null;

    this.modesInOrder = [
      Mode.DARK,
      Mode.TRANSITION_TO_BLOCK,
      Mode.BLOCK,
      Mode.TRANSITION_BACK_TO_DARKNESS,
      Mode.FINAL_BLOCK,
    ];
  };

  currentlyIsOrPreviouslyHasBeenInMode(mode) {
    const { modesInOrder, currentModeIndex } = this;
    const indexOfModeToSearch = modesInOrder.indexOf(mode);
    
    return indexOfModeToSearch !== -1 
      && indexOfModeToSearch <= currentModeIndex;
  }

  getPreviousMode() {
    const { modesInOrder, currentModeIndex } = this;
    return currentModeIndex > 0 ? modesInOrder[currentModeIndex - 1] : null; 
  }

  getCurrentMode() {
    const { modesInOrder, currentModeIndex } = this;
    return modesInOrder[currentModeIndex];
  }

  getTimeSinceTransitionMode() {
    const { timestampSinceTransitionToNewMode } = this;
    return new Date().getTime() - timestampSinceTransitionToNewMode;
  }

  transitionToNextMode() {
    const { modesInOrder } = this;
    
    if (this.currentModeIndex >= (modesInOrder.length - 1)) {
      return;
    }

    this.currentModeIndex++;

    const newlyTransitionedMode = this.getCurrentMode();

    if ([
      Mode.TRANSITION_TO_BLOCK,
      Mode.TRANSITION_BACK_TO_DARKNESS,
      Mode.FINAL_BLOCK,
    ].includes(newlyTransitionedMode)
    ) {
      this.timestampSinceTransitionToNewMode = new Date().getTime();
    }

    console.log(`Transitioning to mode: ${newlyTransitionedMode}`);
  }
}

export default ModeManager;