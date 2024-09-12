import { Chord } from 'tonal';

class KeyEventManager {
  constructor(openingHarmonicScheme = 'major') {
    this.keyEvents = [];
    this.pressedKeys = new Map();
    this.timeStampSinceLastFetchOfNewKeyEventsForFrame = new Date().getTime();
    this.timeStampSinceLastPhraseEventDetected = null;
    this.timeStampSinceLastChordEventDetected = null;
    this.timeStampSinceLastHarmonicQualityChangeEventDetected = null;
    this.currentHarmonicScheme = openingHarmonicScheme;
  }

  getNewKeyEventsForFrame(eventFilter) {
    const timeStampOfCurrentEventFetch = new Date().getTime();

    const newKeyEventsForFrame = this.keyEvents.filter(
      (keyEvent) => {
        const keyEventIsNew = 
          this.timeStampSinceLastFetchOfNewKeyEventsForFrame 
            < keyEvent.time;

        if (eventFilter) {
          return keyEventIsNew && keyEvent.event === eventFilter;
        } else {
          return keyEventIsNew;
        }
      }
    );

    this.timeStampSinceLastFetchOfNewKeyEventsForFrame = 
      timeStampOfCurrentEventFetch;
    
    return newKeyEventsForFrame;
  }

  getRecentlyPhrasedKeyEvents(timeWindow = 2000, eventFilter) {
    const recentlyPhrasedKeyEvents = this.keyEvents.filter(
      (keyEvent) => {
        const keyEventIsNew = 
          this.timeStampSinceLastFetchOfNewKeyEventsForFrame 
            < (keyEvent.time + timeWindow);

        if (eventFilter) {
          return keyEventIsNew && keyEvent.event === eventFilter;
        } else {
          return keyEventIsNew;
        }
      }
    );

    return recentlyPhrasedKeyEvents;
  }

  getNewChordEventForFrame(timeWindowBetweenChordTones = 100) {
    const timeStampOfCurrentEventFetch = new Date().getTime();
    
    const chordToneKeyEvents = this.getRecentlyPhrasedKeyEvents(
      timeWindowBetweenChordTones,
      'noteon',
    );

    if (chordToneKeyEvents.length >= 3
      && (this.timeStampSinceLastChordEventDetected === null 
        || (timeStampOfCurrentEventFetch 
            - this.timeStampSinceLastChordEventDetected
           ) > 100
        )
    ) {
      this.timeStampSinceLastChordEventDetected = timeStampOfCurrentEventFetch;
      
      return chordToneKeyEvents;
    }

    return null;
  }

  getNewPhraseDetectionForFrame(pauseBetweenPhrases = 1000) {
    const { keyEvents } = this
    
    const timeStampOfCurrentEventFetch = new Date().getTime();

    const keyEventsNoteOn = keyEvents.filter(
      (keyEvent) => keyEvent.event === 'noteon'
    );
    
    if (keyEventsNoteOn.length >= 2) {
      if (
        timeStampOfCurrentEventFetch 
        - keyEventsNoteOn[keyEventsNoteOn.length - 1].time
        > pauseBetweenPhrases
      ) {
        return false;
      }

      if (this.timeStampSinceLastPhraseEventDetected === null
        || (timeStampOfCurrentEventFetch
            - this.timeStampSinceLastPhraseEventDetected
           ) > 1000
        ) {
          const hasPhrasePauseBetweenLastTwoKeyEvents =
          keyEventsNoteOn[keyEventsNoteOn.length - 1].time 
          - keyEventsNoteOn[keyEventsNoteOn.length - 2].time
          >= pauseBetweenPhrases;
          
          if (hasPhrasePauseBetweenLastTwoKeyEvents) {
            this.timeStampSinceLastPhraseEventDetected 
              = timeStampOfCurrentEventFetch;
            
            return true;
          } else {
            return false;
          }
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  getNewHarmonicQualityChangeEventForFrame(
    timeWindowBetweenChordTones = 600,
    minimumPeriodBetweenHarmonicChanges = 1000,
  ) {
    const timeStampOfCurrentEventFetch = new Date().getTime();

    const chordToneKeyEvents = 
      this.getNewChordEventForFrame(timeWindowBetweenChordTones);
    
    if (
      chordToneKeyEvents
      && (
        this.timeStampSinceLastHarmonicQualityChangeEventDetected === null
        || (timeStampOfCurrentEventFetch
            - this.timeStampSinceLastHarmonicQualityChangeEventDetected
           ) > minimumPeriodBetweenHarmonicChanges
      )
    ) {
      this.timeStampSinceLastHarmonicQualityChangeEventDetected 
        = timeStampOfCurrentEventFetch;
      
      const chordTonesWithoutOctaveSuffixes = chordToneKeyEvents.map(
        (chordToneKeyEvent) => chordToneKeyEvent.note.split('').filter(
          (character) => !(/^[0-9]*$/.test(character))
        ).join('')
      );
      
      const detectedChord = Chord.detect(chordTonesWithoutOctaveSuffixes);
      
      if (detectedChord.length > 0) {        
        const isMajorLike = 
          detectedChord[0].includes('M')
          || (detectedChord[0].includes('5') && !detectedChord[0].includes('m'))
          || detectedChord[0].includes('maj7')
        
        const harmonicScheme = isMajorLike ? 'major' : 'non-major';
        
        this.currentHarmonicScheme = harmonicScheme;

        return harmonicScheme;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  getPlayedArpeggioDirectionForFrame(
    maxSemitoneDistance = 5,
    timeWindowBetweenChordTones = 600,
  ) {
    const { keyEvents } = this;
    
    const lastThreeNotesPlayed = keyEvents.filter(
      (keyEvent) => keyEvent.event === 'noteon' 
    ).slice(-3);
        
    if (lastThreeNotesPlayed.length >= 3) {
      const noteNumbersOfLastThreeNotesPlayed = 
        lastThreeNotesPlayed.map(({ noteNumber }) => noteNumber);

      const currentTimestamp = new Date().getTime();

      if (
        currentTimestamp - lastThreeNotesPlayed[0].time 
        > (timeWindowBetweenChordTones * 2)
      ) {
        return false;
      }

      if (
        noteNumbersOfLastThreeNotesPlayed.length 
        !== [... new Set(lastThreeNotesPlayed)].length
      ) {
        return false;
      }
      
      if (!(
          (
            noteNumbersOfLastThreeNotesPlayed.toString()
            === noteNumbersOfLastThreeNotesPlayed
              .toSorted()
              .toString()
          ) || (
            noteNumbersOfLastThreeNotesPlayed.toString()
            === noteNumbersOfLastThreeNotesPlayed
              .toSorted()
              .toReversed()
              .toString()
          )
        )
      ) {
        return false;
      }

      if (
        (
          Math.abs(
            lastThreeNotesPlayed[0].noteNumber 
              - lastThreeNotesPlayed[1].noteNumber
          ) <= maxSemitoneDistance
        ) && (
          Math.abs(
            lastThreeNotesPlayed[1].noteNumber 
              - lastThreeNotesPlayed[2].noteNumber 
          ) <= maxSemitoneDistance
        )
      ) {
        return lastThreeNotesPlayed[2].noteNumber 
          > lastThreeNotesPlayed[0].noteNumber
          ? 1 
          : -1;
      }
    } else {
      return false;
    }
  }

  getIntensityIndex(timeWindow = 2000, intensityFactor = 5) {
    return Math.min(
      (
        this.getRecentlyPhrasedKeyEvents(timeWindow, 'noteon')
        .map((recentlyPhrasedKeyEvent) => recentlyPhrasedKeyEvent.attack)
        .reduce(
          (totalIntensity, currentIntensity) => 
            totalIntensity + currentIntensity,
          0
        ) / intensityFactor
      ),
      1
    );
  }

  registerNoteOnEvent(note, number, attack = 1) {
    this.pressedKeys.set(note, { note, noteNumber: number, attack });

    this.keyEvents.push({
      event: 'noteon',
      time: new Date().getTime(),
      note,
      noteNumber: number,
      attack,
    });
  }

  registerNoteOffEvent(note, number) {
    this.pressedKeys.delete(note);

    this.keyEvents.push({
      event: 'noteoff',
      time: new Date().getTime(),
      note,
      noteNumber: number,
    });
  }
}

export default KeyEventManager;