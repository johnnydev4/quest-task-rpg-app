/**
 * Sol de "cristal líquido": un disco cálido con un blob de luz que orbita
 * dentro (recortado por un clipPath) dando sensación de fluido, un aro de
 * cristal en el borde y un brillo superior. La animación corre unos segundos
 * y se congela (repeatCount finito + fill="freeze").
 *
 * Reescrito SIN máscaras ni filtros SVG (feComponentTransfer/feGaussianBlur/
 * mask): iOS Safari los rasteriza mal y el sol salía deformado. Solo se usan
 * gradientes radiales, círculos y clipPath, que iOS renderiza de forma sólida.
 */
const ORBIT = {
  attributeName: 'transform',
  type: 'translate',
  calcMode: 'spline',
  dur: '6.1s',
  repeatCount: 3,
  fill: 'freeze',
  // Órbita cerrada (empieza y acaba igual) para que no dé un salto al repetir.
  values: '0 -14; 22 2; 6 16; -20 3; 0 -14',
  keyTimes: '0; 0.25; 0.5; 0.75; 1',
  keySplines: '0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1',
} as const

export function LiquidSun({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="ls-disc" cx="50%" cy="40%" r="62%">
          <stop offset="0%" stopColor="#ffe79a" />
          <stop offset="45%" stopColor="#ffb24d" />
          <stop offset="100%" stopColor="#ff6a3d" />
        </radialGradient>
        <radialGradient id="ls-blob" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffbeb" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#ffd678" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffd678" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ls-rim" cx="50%" cy="50%" r="50%">
          <stop offset="80%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="92%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id="ls-clip">
          <circle cx="100" cy="100" r="70" />
        </clipPath>
      </defs>

      {/* Disco cálido base */}
      <circle cx="100" cy="100" r="70" fill="url(#ls-disc)" />

      {/* Blob de luz que orbita dentro del disco (recortado): efecto líquido */}
      <g clipPath="url(#ls-clip)">
        <circle cx="100" cy="100" r="48" fill="url(#ls-blob)">
          <animateTransform {...ORBIT} />
        </circle>
      </g>

      {/* Aro de cristal en el borde */}
      <circle cx="100" cy="100" r="70" fill="url(#ls-rim)" />

      {/* Brillo superior (reflejo del cristal) */}
      <ellipse cx="82" cy="66" rx="34" ry="19" fill="#ffffff" opacity="0.18" />
    </svg>
  )
}
