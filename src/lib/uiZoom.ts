// Grosse Bildschirme (Samet, 30.09.2026): über 2000 px Fensterbreite
// vergrössert index.html die GANZE Oberfläche mit `zoom` auf <html> —
// +30 % ab 2001 px, +40 % ab 2501 px, +50 % ab 3001 px (Faktor auch in
// `--ofi-zoom`). Schrift, Symbole, Logos, Abstände wachsen gemeinsam.
//
// CSS-`zoom` ist aber nicht der Browser-Zoom: Chrome meldet Mauskoordinaten,
// getBoundingClientRect, innerWidth/innerHeight, die Fenster-Scrollwerte und
// elementFromPoint weiter in FENSTER-Pixeln, während jede Länge, die ein
// Skript zurückschreibt (`style.left = x + 'px'`), im vergrösserten Raum
// noch einmal mit dem Faktor gemalt wird. Popups, Kalender, Ziehen,
// Spaltenbreiten, Ant Design und motion lägen um 30–50 % daneben.
//
// Dieses Modul rechnet genau diese Schnittstellen in den Seitenraum um, so
// wie der echte Browser-Zoom sie meldet (gemessen in Chrome 152):
//   heraus ÷ Faktor — Rechtecke, Maus-/Touch-Koordinaten, innerWidth/Height,
//                     visualViewport, Fenster-Scroll, client*/scroll* von <html>
//   hinein × Faktor — elementFromPoint & Co., scrollTo/scrollBy des Fensters
//   devicePixelRatio × Faktor — Canvas (Unterschrift, QR) bleibt scharf.
// offset*, client*/scroll* gewöhnlicher Elemente, getComputedStyle und
// ResizeObserver liefern schon Seitenwerte und bleiben unberührt.
//
// Nur aktiv, wenn index.html `html.ofi-zoomable` gesetzt hat (oberstes
// Fenster, Browser mit standardisiertem zoom). Bei Faktor 1 geht jeder Pfad
// unverändert an den Browser durch. MUSS als erstes Modul laufen (main.tsx),
// bevor irgendein Code misst.

type Getter = (this: unknown) => unknown

const root = document.documentElement
const nativeInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')?.get

let measuredWidth = -1
let factor = 1

/** Aktueller Zoomfaktor der Seite (1 = kein Zoom). Ändert sich nur mit der
 *  Fensterbreite, darum wird er erst dann neu gelesen. */
export const uiZoom = (): number => {
  if (!nativeInnerWidth) return 1
  const width = nativeInnerWidth.call(window) as number
  if (width !== measuredWidth) {
    measuredWidth = width
    const zoom = (root as Element & { currentCSSZoom?: number }).currentCSSZoom
    factor = typeof zoom === 'number' && zoom > 0 ? zoom : 1
  }
  return factor
}

const patchGetter = (target: object, key: string, wrap: (native: Getter) => Getter) => {
  const descriptor = Object.getOwnPropertyDescriptor(target, key)
  if (!descriptor?.get || !descriptor.configurable) return
  Object.defineProperty(target, key, { ...descriptor, get: wrap(descriptor.get as Getter) })
}

const patchMethod = <T extends (...args: never[]) => unknown>(
  target: object,
  key: string,
  wrap: (native: T) => T,
) => {
  const native = (target as Record<string, unknown>)[key]
  if (typeof native !== 'function') return
  Object.defineProperty(target, key, {
    value: wrap(native as T),
    writable: true,
    configurable: true,
    enumerable: Object.getOwnPropertyDescriptor(target, key)?.enumerable ?? false,
  })
}

/** Zahl-Getter, deren Wert in Fensterpixeln kommt: ÷ Faktor. */
const divideGetter = (target: object, key: string, round = false) =>
  patchGetter(target, key, (native) => function (this: unknown) {
    const value = native.call(this) as number
    const z = uiZoom()
    if (z === 1 || typeof value !== 'number') return value
    return round ? Math.round(value / z) : value / z
  })

const scaleRect = (rect: DOMRectReadOnly, z: number) =>
  new DOMRect(rect.x / z, rect.y / z, rect.width / z, rect.height / z)

const scaleRectList = (list: DOMRectList, z: number) => {
  const rects = Array.from(list, (rect) => scaleRect(rect, z))
  return Object.assign(rects, { item: (index: number) => rects[index] ?? null }) as unknown as DOMRectList
}

const install = () => {
  // Rechtecke von Elementen und Textbereichen.
  for (const proto of [Element.prototype, Range.prototype]) {
    patchMethod<() => DOMRect>(proto, 'getBoundingClientRect', (native) => function (this: unknown) {
      const rect = native.call(this)
      const z = uiZoom()
      return z === 1 ? rect : scaleRect(rect, z)
    })
    patchMethod<() => DOMRectList>(proto, 'getClientRects', (native) => function (this: unknown) {
      const list = native.call(this)
      const z = uiZoom()
      return z === 1 ? list : scaleRectList(list, z)
    })
  }

  // Maus, Zeiger, Ziehen (PointerEvent/DragEvent/WheelEvent erben von
  // MouseEvent). Selbst erzeugte Ereignisse (isTrusted = false) tragen die
  // Werte, mit denen ein Skript sie gebaut hat — schon im Seitenraum.
  for (const key of ['clientX', 'clientY', 'pageX', 'pageY', 'x', 'y', 'offsetX', 'offsetY', 'movementX', 'movementY']) {
    patchGetter(MouseEvent.prototype, key, (native) => function (this: unknown) {
      const value = native.call(this) as number
      if (!(this as Event).isTrusted) return value
      const z = uiZoom()
      return z === 1 ? value : value / z
    })
  }
  if (typeof Touch !== 'undefined') {
    for (const key of ['clientX', 'clientY', 'pageX', 'pageY']) divideGetter(Touch.prototype, key)
  }

  // Fenstermasse und Fenster-Scroll.
  divideGetter(window, 'innerWidth', true)
  divideGetter(window, 'innerHeight', true)
  for (const key of ['scrollX', 'scrollY', 'pageXOffset', 'pageYOffset']) divideGetter(window, key)
  patchGetter(window, 'devicePixelRatio', (native) => function (this: unknown) {
    const value = native.call(this) as number
    return value * uiZoom()
  })
  if (typeof VisualViewport !== 'undefined') {
    for (const key of ['width', 'height', 'offsetLeft', 'offsetTop', 'pageLeft', 'pageTop']) {
      divideGetter(VisualViewport.prototype, key)
    }
  }

  const scaleScrollArgs = (args: unknown[]): unknown[] => {
    const z = uiZoom()
    if (z === 1 || args.length === 0) return args
    const [first, second] = args
    if (typeof first === 'object' && first !== null) {
      const options = { ...(first as ScrollToOptions) }
      if (typeof options.left === 'number') options.left *= z
      if (typeof options.top === 'number') options.top *= z
      return [options]
    }
    return args.length < 2 ? args : [Number(first) * z, Number(second) * z]
  }
  const windowScrollHost = Object.prototype.hasOwnProperty.call(window, 'scrollTo') ? window : Window.prototype
  for (const key of ['scrollTo', 'scroll', 'scrollBy']) {
    patchMethod<(...args: unknown[]) => void>(windowScrollHost, key, (native) => function (this: unknown, ...args: unknown[]) {
      return native.apply(this, scaleScrollArgs(args))
    })
  }

  // <html> ist der Scroller des Fensters: seine client*/scroll*-Werte kommen
  // in Fensterpixeln, die jedes anderen Elements schon im Seitenraum.
  for (const key of ['clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight']) {
    patchGetter(Element.prototype, key, (native) => function (this: unknown) {
      const value = native.call(this) as number
      if (this !== root) return value
      const z = uiZoom()
      return z === 1 ? value : Math.round(value / z)
    })
  }
  for (const key of ['scrollTop', 'scrollLeft']) {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, key)
    if (!descriptor?.get || !descriptor.set || !descriptor.configurable) continue
    const get = descriptor.get
    const set = descriptor.set
    Object.defineProperty(Element.prototype, key, {
      ...descriptor,
      get(this: Element) {
        const value = get.call(this) as number
        if (this !== root) return value
        const z = uiZoom()
        return z === 1 ? value : value / z
      },
      set(this: Element, value: number) {
        set.call(this, this === root ? value * uiZoom() : value)
      },
    })
  }
  for (const key of ['scrollTo', 'scroll', 'scrollBy']) {
    patchMethod<(...args: unknown[]) => void>(Element.prototype, key, (native) => function (this: unknown, ...args: unknown[]) {
      return native.apply(this, this === root ? scaleScrollArgs(args) : args)
    })
  }

  // Punkt → Element: die Koordinaten kommen aus dem Seitenraum.
  const hosts: object[] = [Document.prototype]
  if (typeof ShadowRoot !== 'undefined') hosts.push(ShadowRoot.prototype)
  for (const host of hosts) {
    for (const key of ['elementFromPoint', 'elementsFromPoint', 'caretRangeFromPoint', 'caretPositionFromPoint']) {
      patchMethod<(x: number, y: number, ...rest: unknown[]) => unknown>(host, key, (native) => function (this: unknown, x: number, y: number, ...rest: unknown[]) {
        const z = uiZoom()
        return native.call(this, x * z, y * z, ...rest)
      })
    }
  }

  // Sichtbarkeits-Beobachter: gleiche Rechtecke wie getBoundingClientRect.
  if (typeof IntersectionObserverEntry !== 'undefined') {
    for (const key of ['boundingClientRect', 'intersectionRect', 'rootBounds']) {
      patchGetter(IntersectionObserverEntry.prototype, key, (native) => function (this: unknown) {
        const rect = native.call(this) as DOMRectReadOnly | null
        const z = uiZoom()
        return rect && z !== 1 ? scaleRect(rect, z) : rect
      })
    }
  }
}

if (root.classList.contains('ofi-zoomable')) install()
