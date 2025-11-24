import { Chord } from "tonal";
import {
  NormalizedFloat,
  NoteDownEvent,
  NoteEvent,
  NoteEventType,
  NoteUpEvent,
} from "../types";
import { toNormalizedFloat } from "../util";

export default class NoteEventManager {
  #noteEvents: NoteEvent[] = [];
  #activeNotes: Map<string, NoteDownEvent> = new Map();
  #noteEventsForFrames: Map<number, NoteEvent[]> = new Map();
  #timeStampSinceLastFetchOfNewNoteEventsForFrame: number;
  #timeStampSinceLastPhraseEventDetected: number | null = null;
  #timeStampSinceLastChordEventDetected: number | null = null;
  #timeStampSinceLastHarmonicQualityChangeEventDetected: number | null = null;

  currentHarmonicScheme: "major" | "non-major";

  constructor(openingHarmonicScheme: "major" | "non-major" = "major") {
    this.#timeStampSinceLastFetchOfNewNoteEventsForFrame = new Date().getTime();
    this.currentHarmonicScheme = openingHarmonicScheme;
  }

  get activeNotes() {
    return Array.from(this.#activeNotes.values());
  }

  getNewNoteEventsForFrame(
    frameIndex: number,
    eventFilter?: NoteEventType
  ): NoteEvent[] {
    const timeStampOfCurrentEventFetch = new Date().getTime();

    let newNoteEventsForFrame: NoteEvent[] = [];

    if (!this.#noteEventsForFrames.has(frameIndex)) {
      newNoteEventsForFrame = this.#noteEvents.filter(
        (noteEvent) =>
          this.#timeStampSinceLastFetchOfNewNoteEventsForFrame < noteEvent.time
      );

      this.#noteEventsForFrames.set(frameIndex, newNoteEventsForFrame);
    } else {
      newNoteEventsForFrame = this.#noteEventsForFrames.get(frameIndex)!;
    }

    this.#timeStampSinceLastFetchOfNewNoteEventsForFrame =
      timeStampOfCurrentEventFetch;

    if (!eventFilter) {
      return newNoteEventsForFrame;
    }

    return eventFilter
      ? newNoteEventsForFrame.filter(
          (noteEvent) => noteEvent.event === eventFilter
        )
      : newNoteEventsForFrame;
  }

  getRecentlyPhrasedNoteEvents(
    timeWindow: number = 2000,
    eventFilter?: string
  ): NoteEvent[] {
    const recentlyPhrasedNoteEvents = this.#noteEvents.filter((noteEvent) => {
      const noteEventIsNew =
        this.#timeStampSinceLastFetchOfNewNoteEventsForFrame <
        noteEvent.time + timeWindow;

      if (eventFilter) {
        return noteEventIsNew && noteEvent.event === eventFilter;
      } else {
        return noteEventIsNew;
      }
    });

    return recentlyPhrasedNoteEvents;
  }

  getNewChordEventForFrame(timeWindowBetweenChordTones = 100) {
    const timeStampOfCurrentEventFetch = new Date().getTime();

    const chordToneNoteEvents = this.getRecentlyPhrasedNoteEvents(
      timeWindowBetweenChordTones,
      "notedown"
    );

    if (
      chordToneNoteEvents.length >= 3 &&
      (this.#timeStampSinceLastChordEventDetected === null ||
        timeStampOfCurrentEventFetch -
          this.#timeStampSinceLastChordEventDetected >
          100)
    ) {
      this.#timeStampSinceLastChordEventDetected = timeStampOfCurrentEventFetch;

      return chordToneNoteEvents;
    }

    return null;
  }

  getNewPhraseDetectionForFrame(pauseBetweenPhrases = 1000): boolean {
    const timeStampOfCurrentEventFetch = new Date().getTime();

    const noteEventsNoteOn = this.#noteEvents.filter(
      (noteEvent) => noteEvent.event === "notedown"
    );

    if (noteEventsNoteOn.length < 2) {
      return false;
    }

    const lastEvent = noteEventsNoteOn[noteEventsNoteOn.length - 1]!;
    const secondToLastEvent = noteEventsNoteOn[noteEventsNoteOn.length - 2]!;

    if (timeStampOfCurrentEventFetch - lastEvent.time > pauseBetweenPhrases) {
      return false;
    }

    if (
      this.#timeStampSinceLastPhraseEventDetected === null ||
      timeStampOfCurrentEventFetch -
        this.#timeStampSinceLastPhraseEventDetected >
        1000
    ) {
      const hasPhrasePauseBetweenLastTwoNoteEvents =
        lastEvent.time - secondToLastEvent.time >= pauseBetweenPhrases;

      if (hasPhrasePauseBetweenLastTwoNoteEvents) {
        this.#timeStampSinceLastPhraseEventDetected =
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

    const chordToneNoteEvents = this.getNewChordEventForFrame(
      timeWindowBetweenChordTones
    );

    if (
      chordToneNoteEvents &&
      (this.#timeStampSinceLastHarmonicQualityChangeEventDetected === null ||
        timeStampOfCurrentEventFetch -
          this.#timeStampSinceLastHarmonicQualityChangeEventDetected >
          minimumPeriodBetweenHarmonicChanges)
    ) {
      this.#timeStampSinceLastHarmonicQualityChangeEventDetected =
        timeStampOfCurrentEventFetch;

      const chordTonesWithoutOctaveSuffixes = chordToneNoteEvents.map(
        (chordToneNoteEvent) =>
          chordToneNoteEvent.note
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
    const lastThreeNotesPlayed = this.#noteEvents
      .filter((noteEvent) => noteEvent.event === "notedown")
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
      this.getRecentlyPhrasedNoteEvents(timeWindow, "notedown")
        .map(
          (recentlyPhrasedNoteEvent) =>
            (recentlyPhrasedNoteEvent as NoteDownEvent).attack
        )
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
    attack: NormalizedFloat = toNormalizedFloat(1)
  ): void {
    const noteDownEvent: NoteDownEvent = {
      event: "notedown",
      time: new Date().getTime(),
      note,
      noteNumber: number,
      attack,
    };

    this.#activeNotes.set(note, noteDownEvent);
    this.#noteEvents.push(noteDownEvent);
  }

  registerNoteOffEvent(note: string, number: number): void {
    const noteUpEvent: NoteUpEvent = {
      event: "noteup",
      time: new Date().getTime(),
      note,
      noteNumber: number,
    };

    this.#activeNotes.delete(note);
    this.#noteEvents.push(noteUpEvent);
  }
}
