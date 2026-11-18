import { formatDurationSeconds } from './format-duration';

describe('formatDurationSeconds', () => {
  it.each([
    [0, '0 min'],
    [29, '0 min'],
    [30, '1 min'],
    [59, '1 min'],
    [1204, '20 min'],
    [3600, '1 h 0 min'],
    [3900, '1 h 5 min'],
    [7325, '2 h 2 min'],
  ])('%i segundos -> "%s"', (seconds, expected) => {
    expect(formatDurationSeconds(seconds)).toBe(expected);
  });
});
