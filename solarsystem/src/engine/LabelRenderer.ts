/**
 * 3D annotation layer.
 *
 * Labels are DOM elements positioned from the projected world position, which
 * keeps text crisp at any DPI (a canvas texture would blur on a 4K panel) and
 * makes the layer screen-reader friendly.
 *
 * The policy required by the specification is implemented explicitly:
 *  - labels always face the camera (they are 2D overlays),
 *  - the font scales with the viewport, so a 4K panel gets a 4K-sized label,
 *  - objects are ordered by priority (planets first, then dwarf planets, major
 *    moons, then everything else) and low-priority labels are dropped when the
 *    budget or the on-screen space runs out,
 *  - the current search/selection target is always drawn.
 */
import { Vector3, type Camera } from 'three'

export interface LabelCandidate {
  id: string
  worldPosition: Vector3
  label: string
  sublabel?: string
  priority: number
  colour: string
  selected: boolean
}

interface LabelSlot {
  element: HTMLElement
  title: HTMLElement
  subtitle: HTMLElement
}

export interface LabelLayoutOptions {
  camera: Camera
  width: number
  height: number
  /** Maximum number of labels to draw in this frame. */
  budget: number
  /** Identifiers that must always be drawn (selection / search target). */
  forced: ReadonlySet<string>
  /** Minimum pixel separation between two label centres. */
  minSeparation: number
  fontSizePx: number
}

export class LabelRenderer {
  private readonly container: HTMLElement
  private readonly slots: LabelSlot[] = []
  private activeCount = 0
  private readonly projected = new Vector3()
  private readonly occupied: Array<{ x: number; y: number; w: number; h: number }> = []

  constructor(container: HTMLElement) {
    this.container = container
    this.container.classList.add('label-layer')
  }

  get count(): number {
    return this.activeCount
  }

  sync(candidates: LabelCandidate[], options: LabelLayoutOptions): void {
    this.projected.set(0, 0, 0)
    const ordered = [...candidates].sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? -1 : 1
      return b.priority - a.priority
    })

    this.occupied.length = 0
    let used = 0
    for (const candidate of ordered) {
      const forced = options.forced.has(candidate.id) || candidate.selected
      if (used >= options.budget && !forced) {
        this.hideFrom(used)
        break
      }
      const slot = this.slot(used)
      const visible = this.place(slot, candidate, options, forced)
      if (visible) used += 1
    }
    this.hideFrom(used)
    this.activeCount = used
  }

  private place(
    slot: LabelSlot,
    candidate: LabelCandidate,
    options: LabelLayoutOptions,
    forced: boolean,
  ): boolean {
    const projected = this.projected.copy(candidate.worldPosition).project(options.camera)
    // Behind the camera or outside the viewport (with a margin for the text box).
    if (projected.z < -1 || projected.z > 1) {
      slot.element.style.display = 'none'
      return false
    }
    const x = (projected.x * 0.5 + 0.5) * options.width
    const y = (-projected.y * 0.5 + 0.5) * options.height
    if (x < -60 || y < -30 || x > options.width + 60 || y > options.height + 30) {
      slot.element.style.display = 'none'
      return false
    }

    // Overlap test against the labels already accepted this frame.
    const halfWidth = options.fontSizePx * 4.2
    const halfHeight = options.fontSizePx * 1.6
    if (!forced) {
      for (const box of this.occupied) {
        if (Math.abs(box.x - x) < halfWidth + box.w && Math.abs(box.y - y) < halfHeight + box.h) {
          slot.element.style.display = 'none'
          return false
        }
      }
    }
    this.occupied.push({ x, y, w: halfWidth, h: halfHeight })

    if (slot.title.textContent !== candidate.label) slot.title.textContent = candidate.label
    const subtitleText = candidate.sublabel ?? ''
    if (slot.subtitle.textContent !== subtitleText) slot.subtitle.textContent = subtitleText
    slot.subtitle.style.display = subtitleText ? '' : 'none'

    slot.element.style.display = ''
    slot.element.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    slot.element.style.fontSize = `${options.fontSizePx}px`
    slot.element.dataset.objectId = candidate.id
    slot.element.classList.toggle('label--selected', candidate.selected)
    // Priority is encoded as a data attribute so CSS can style classes differently.
    if (slot.element.dataset.priority !== String(candidate.priority)) {
      slot.element.dataset.priority = String(candidate.priority)
    }
    if (slot.element.dataset.colour !== candidate.colour) {
      slot.element.dataset.colour = candidate.colour
    }
    slot.element.style.setProperty('--label-colour', candidate.colour)
    return true
  }

  private slot(index: number): LabelSlot {
    const existing = this.slots[index]
    if (existing) return existing
    const element = document.createElement('div')
    element.className = 'label'
    const title = document.createElement('span')
    title.className = 'label__title'
    const subtitle = document.createElement('span')
    subtitle.className = 'label__subtitle'
    element.append(title, subtitle)
    this.container.appendChild(element)
    const slot: LabelSlot = { element, title, subtitle }
    this.slots.push(slot)
    return slot
  }

  private hideFrom(index: number): void {
    for (let cursor = index; cursor < this.slots.length; cursor++) {
      this.slots[cursor].element.style.display = 'none'
    }
  }

  clear(): void {
    for (const slot of this.slots) slot.element.style.display = 'none'
    this.activeCount = 0
  }

  /** Resolves the object id under a screen coordinate, for click hit-testing on labels. */
  hitTest(clientX: number, clientY: number): string | null {
    for (const slot of this.slots) {
      if (slot.element.style.display === 'none') continue
      const rect = slot.element.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return slot.element.dataset.objectId ?? null
      }
    }
    return null
  }

  dispose(): void {
    for (const slot of this.slots) slot.element.remove()
    this.slots.length = 0
    this.container.classList.remove('label-layer')
  }
}