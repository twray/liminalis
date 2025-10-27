import { Chord } from "tonal";
import { createNormalizedFloat, NormalizedFloat } from "../types";

type KeyEventType = "noteon" | "noteoff";

interface KeyEvent {
  time: number;
  event: KeyEventType;
  note: string;
  noteNumber: number;
  attack?: NormalizedFloat;
  [key: string]: any;
}

export default class KeyEventManager {
  private keyEvents: KeyEvent[] = [];
  private pressedKeys: Map<string, any> = new Map();
  private keyEventsForFrames: Map<number, KeyEvent[]> = new Map();
  private timeStampSinceLastFetchOfNewKeyEventsForFrame: number;
  private timeStampSinceLastPhraseEventDetected: number | null = null;
  private timeStampSinceLastChordEventDetected: number | null = null;
  private timeStampSinceLastHarmonicQualityChangeEventDetected: number | null =
    null;
  public currentHarmonicScheme: "major" | "non-major";

  constructor(openingHarmonicScheme: "major" | "non-major" = "major") {
    this.timeStampSinceLastFetchOfNewKeyEventsForFrame = new Date().getTime();
    this.currentHarmonicScheme = openingHarmonicScheme;
  }

  getNewKeyEventsForFrame(
    frameIndex: number,
    eventFilter?: KeyEventType
  ): KeyEvent[] {
    const timeStampOfCurrentEventFetch = new Date().getTime();

    let newKeyEventsForFrame: KeyEvent[] = [];

    if (!this.keyEventsForFrames.has(frameIndex)) {
      newKeyEventsForFrame = this.keyEvents.filter(
        (keyEvent) =>
          this.timeStampSinceLastFetchOfNewKeyEventsForFrame < keyEvent.time
      );

      this.keyEventsForFrames.set(frameIndex, newKeyEventsForFrame);
    } else {
      newKeyEventsForFrame = this.keyEventsForFrames.get(frameIndex)!;
    }

    this.timeStampSinceLastFetchOfNewKeyEventsForFrame =
      timeStampOfCurrentEventFetch;

    return eventFilter
      ? newKeyEventsForFrame.filter(
          (keyEvent) => keyEvent.event === eventFilter
        )
      : newKeyEventsForFrame;
  }

  getRecentlyPhrasedKeyEvents(
    timeWindow: number = 2000,
    eventFilter?: string
  ): KeyEvent[] {
    const recentlyPhrasedKeyEvents = this.keyEvents.filter((keyEvent) => {
      const keyEventIsNew =
        this.timeStampSinceLastFetchOfNewKeyEventsForFrame <
        keyEvent.time + timeWindow;

      if (eventFilter) {
        return keyEventIsNew && keyEvent.event === eventFilter;
      } else {
        return keyEventIsNew;
      }
    });

    return recentlyPhrasedKeyEvents;
  }

  getNewChordEventForFrame(timeWindowBetweenChordTones = 100) {
    const timeStampOfCurrentEventFetch = new Date().getTime();

    const chordToneKeyEvents = this.getRecentlyPhrasedKeyEvents(
      timeWindowBetweenChordTones,
      "noteon"
    );

    if (
      chordToneKeyEvents.length >= 3 &&
      (this.timeStampSinceLastChordEventDetected === null ||
        timeStampOfCurrentEventFetch -
          this.timeStampSinceLastChordEventDetected >
          100)
    ) {
      this.timeStampSinceLastChordEventDetected = timeStampOfCurrentEventFetch;

      return chordToneKeyEvents;
    }

    return null;
  }

  getNewPhraseDetectionForFrame(pauseBetweenPhrases = 1000): boolean {
    const { keyEvents } = this;

    const timeStampOfCurrentEventFetch = new Date().getTime();

    const keyEventsNoteOn = keyEvents.filter(
      (keyEvent) => keyEvent.event === "noteon"
    );

    if (keyEventsNoteOn.length < 2) {
      return false;
    }

    const lastEvent = keyEventsNoteOn[keyEventsNoteOn.length - 1]!;
    const secondToLastEvent = keyEventsNoteOn[keyEventsNoteOn.length - 2]!;

    if (timeStampOfCurrentEventFetch - lastEvent.time > pauseBetweenPhrases) {
      return false;
    }

    if (
      this.timeStampSinceLastPhraseEventDetected === null ||
      timeStampOfCurrentEventFetch -
        this.timeStampSinceLastPhraseEventDetected >
        1000
    ) {
      const hasPhrasePauseBetweenLastTwoKeyEvents =
        lastEvent.time - secondToLastEvent.time >= pauseBetweenPhrases;

      if (hasPhrasePauseBetweenLastTwoKeyEvents) {
        this.timeStampSinceLastPhraseEventDetected =
          timeStampOfCurrentEventFetch;
        return true;
      } else {
        return false;
      }
    }

    // Default return for any remaining code paths
    return false;
  }

  getNewHarmonicQualityChangeEventForFrame(
    timeWindowBetweenChordTones = 600,
    minimumPeriodBetweenHarmonicChanges = 1000
  ) {
    const timeStampOfCurrentEventFetch = new Date().getTime();

    const chordToneKeyEvents = this.getNewChordEventForFrame(
      timeWindowBetweenChordTones
    );

    if (
      chordToneKeyEvents &&
      (this.timeStampSinceLastHarmonicQualityChangeEventDetected === null ||
        timeStampOfCurrentEventFetch -
          this.timeStampSinceLastHarmonicQualityChangeEventDetected >
          minimumPeriodBetweenHarmonicChanges)
    ) {
      this.timeStampSinceLastHarmonicQualityChangeEventDetected =
        timeStampOfCurrentEventFetch;

      const chordTonesWithoutOctaveSuffixes = chordToneKeyEvents.map(
        (chordToneKeyEvent) =>
          chordToneKeyEvent.note
            .split("")
            .filter((character) => !/^[0-9]*$/.test(character))
            .join("")
      );

      const detectedChord = Chord.detect(chordTonesWithoutOctaveSuffixes);

      if (detectedChord.length > 0) {
        const isMajorLike =
          detectedChord[0]?.includes("M") ||
          (detectedChord[0]?.includes("5") &&
            !detectedChord[0]?.includes("m")) ||
          detectedChord[0]?.includes("maj7");

        const harmonicScheme = isMajorLike ? "major" : "non-major";

        this.currentHarmonicScheme = harmonicScheme;

        return harmonicScheme;
      }

      return null;
    } else {
      return null;
    }
  }

  getPlayedArpeggioDirectionForFrame(
    maxSemitoneDistance = 5,
    timeWindowBetweenChordTones = 600
  ) {
    const { keyEvents } = this;

    const lastThreeNotesPlayed = keyEvents
      .filter((keyEvent) => keyEvent.event === "noteon")
      .slice(-3);

    if (lastThreeNotesPlayed.length >= 3) {
      const noteNumbersOfLastThreeNotesPlayed = lastThreeNotesPlayed.map(
        ({ noteNumber }) => noteNumber
      );

      const currentTimestamp = new Date().getTime();

      if (
        currentTimestamp - lastThreeNotesPlayed[0].time >
        timeWindowBetweenChordTones * 2
      ) {
        return null;
      }

      if (
        noteNumbersOfLastThreeNotesPlayed.length !==
        [...new Set(lastThreeNotesPlayed)].length
      ) {
        return null;
      }

      if (
        !(
          noteNumbersOfLastThreeNotesPlayed.toString() ===
            noteNumbersOfLastThreeNotesPlayed.toSorted().toString() ||
          noteNumbersOfLastThreeNotesPlayed.toString() ===
            noteNumbersOfLastThreeNotesPlayed.toSorted().toReversed().toString()
        )
      ) {
        return null;
      }

      if (
        Math.abs(
          lastThreeNotesPlayed[0].noteNumber -
            lastThreeNotesPlayed[1].noteNumber
        ) <= maxSemitoneDistance &&
        Math.abs(
          lastThreeNotesPlayed[1].noteNumber -
            lastThreeNotesPlayed[2].noteNumber
        ) <= maxSemitoneDistance
      ) {
        return lastThreeNotesPlayed[2].noteNumber >
          lastThreeNotesPlayed[0].noteNumber
          ? 1
          : -1;
      }
      return null;
    } else {
      return null;
    }
  }

  getIntensityIndex(timeWindow = 2000, intensityFactor = 5) {
    return Math.min(
      this.getRecentlyPhrasedKeyEvents(timeWindow, "noteon")
        .map((recentlyPhrasedKeyEvent) => recentlyPhrasedKeyEvent.attack)
        .reduce(
          (totalIntensity, currentIntensity) =>
            totalIntensity + (currentIntensity ?? 0),
          0
        ) / intensityFactor,
      1
    );
  }

  registerNoteOnEvent(
    note: string,
    number: number,
    attack: NormalizedFloat = createNormalizedFloat(1)
  ): void {
    this.pressedKeys.set(note, { note, noteNumber: number, attack });

    this.keyEvents.push({
      event: "noteon",
      time: new Date().getTime(),
      note,
      noteNumber: number,
      attack,
    });
  }

  registerNoteOffEvent(note: string, number: number): void {
    this.pressedKeys.delete(note);

    this.keyEvents.push({
      event: "noteoff",
      time: new Date().getTime(),
      note,
      noteNumber: number,
    });
  }
}
