import { isDuplicate, markAsProcessed, resetIdempotency } from '@notifications/idempotency';

describe('Idempotencia', () => {
  beforeEach(() => {
    resetIdempotency();
  });

  it('detecta un identificador ya procesado', () => {
    expect(isDuplicate('abc')).toBe(false);
    markAsProcessed('abc');
    expect(isDuplicate('abc')).toBe(true);
  });

  it('no confunde identificadores distintos', () => {
    markAsProcessed('abc');
    expect(isDuplicate('def')).toBe(false);
  });
});
