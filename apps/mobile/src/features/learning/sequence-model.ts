// Tapping a selected card removes it and closes the gap, corrections never require dragging.
export function toggleSequenceCard(selection: readonly number[], index: number): number[] {
  return selection.includes(index)
    ? selection.filter((selected) => selected !== index)
    : [...selection, index];
}

export function isSequenceCorrect(selection: readonly number[], itemCount: number): boolean {
  return selection.length === itemCount && selection.every((index, position) => index === position);
}
