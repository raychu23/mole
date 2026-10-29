// T28 fixture: a callback passed as an argument (each -> visit is only visible at runtime).
export function each(xs: number[], f: (x: number) => number): number[] {
  const out: number[] = [];
  for (const x of xs) out.push(f(x));
  return out;
}

export function visit(x: number): number {
  return x * 2;
}

export function use(xs: number[]): number[] {
  return each(xs, visit);
}
