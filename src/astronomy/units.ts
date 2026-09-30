export const KM_PER_AU = 149_597_870.7;

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}

export function kmToAu(km: number): number {
  requireFinite(km, "Kilometers");
  return km / KM_PER_AU;
}

export function auToKm(au: number): number {
  requireFinite(au, "Astronomical units");
  return au * KM_PER_AU;
}
