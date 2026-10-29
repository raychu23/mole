import { expect, it } from 'vitest';
import { use } from '../src/app';

it('doubles through a callback', () => {
  expect(use([1, 2])).toEqual([2, 4]);
});
