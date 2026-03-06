import { useRef, useEffect, useState } from 'react'

/**
 * Scroll-triggered reveal wrapper.
 * Wraps children in a div that fades + slides into view when scrolled into viewport.
 *
 * Props:
 *   delay   – ms delay before transition (use for staggered siblings)
 *   from    – 'bottom' | 'left' | 'right' | 'fade'
 *   as      – HTML tag to render (default 'div')
 *   className – extra classes on the wrapper
 */
export default function Reveal({
  children,
  delay = 0,
  from = 'bottom',
  as: Tag = 'div',
  className = '',
}) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(el)
        }
      },
      { threshold: 0.10, rootMargin: '0px 0px -40px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const hiddenMap = {
    bottom: 'opacity-0 translate-y-8',
    left:   'opacity-0 -translate-x-7',
    right:  'opacity-0 translate-x-7',
    fade:   'opacity-0',
  }
  const hidden = hiddenMap[from] ?? hiddenMap.bottom

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={[
        'transition-all duration-700 ease-out will-change-transform',
        visible
          ? 'opacity-100 translate-y-0 translate-x-0'
          : hidden,
        className,
      ].join(' ')}
    >
      {children}
    </Tag>
  )
}
