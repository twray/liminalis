export const getMsSince = (
  time: Date | null,
  referenceTime?: Date | null,
): number => {
  const timeNow = referenceTime ? referenceTime.getTime() : Date.now();
  return time ? timeNow - time.getTime() : 0;
};
