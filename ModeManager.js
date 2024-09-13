import Mode from "./Mode";

class ModeManager {
  constructor(modeTransitionNote) {
    this.modeTransitionNote = modeTransitionNote;
    this.currentModeIndex = 0;

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

  transitionToNextMode() {
    const { modesInOrder } = this;
    
    this.currentModeIndex = 
      this.currentModeIndex + 1 > (modesInOrder.length - 1)
      ? 0
      : this.currentModeIndex + 1;

    console.log(`Transitioning to mode: ${this.getCurrentMode()}`);
  }
}

export default ModeManager;