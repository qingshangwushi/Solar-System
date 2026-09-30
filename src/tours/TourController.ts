export interface TourStep {
  bodyId: string;
  title: string;
  description: string;
}

export interface TourDefinition {
  id: string;
  name: string;
  steps: TourStep[];
}

export class TourController {
  private tour?: TourDefinition;
  private index = -1;

  constructor(private readonly tours: TourDefinition[], private readonly availableBodyIds: ReadonlySet<string>) {
    const ids = new Set<string>();
    for (const tour of tours) {
      if (!tour.id || ids.has(tour.id) || tour.steps.length === 0) throw new TypeError("Tours require unique IDs and at least one step");
      ids.add(tour.id);
      for (const step of tour.steps) if (!availableBodyIds.has(step.bodyId)) throw new TypeError(`Tour ${tour.id} references unknown body ${step.bodyId}`);
    }
  }

  get isPlaying(): boolean { return Boolean(this.tour); }
  get current(): TourStep | undefined { return this.tour?.steps[this.index]; }

  start(tourId: string): TourStep | undefined {
    const tour = this.tours.find((candidate) => candidate.id === tourId);
    if (!tour) throw new Error(`Unknown tour: ${tourId}`);
    this.tour = tour;
    this.index = 0;
    return this.current;
  }

  next(): TourStep | undefined {
    if (!this.tour) return undefined;
    this.index += 1;
    if (this.index >= this.tour.steps.length) { this.stop(); return undefined; }
    return this.current;
  }

  stop(): void { this.tour = undefined; this.index = -1; }
}
