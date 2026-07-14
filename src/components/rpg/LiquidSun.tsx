/**
 * Sol de "cristal líquido": un blob de fuego orbita dentro del disco solar
 * (recortado por máscaras), con un resplandor difuminado hacia dentro y realces
 * blancos en el borde. La animación corre unos segundos y se congela sola
 * (repeatCount finito + fill="freeze"), dejando el sol en reposo.
 *
 * SVG original exportado a mano; solo se cambió el bucle infinito por 3 vueltas.
 */
const ORBIT = {
  attributeName: 'transform',
  type: 'translate',
  calcMode: 'spline',
  dur: '2.033s',
  begin: '0s',
  repeatCount: 3,
  fill: 'freeze',
  values:
    '199.875 126.938; 272.875 199.938; 199.875 272.938; 126.875 199.938; 199.875 126.938; 199.875 126.938',
  keyTimes: '0; 0.245902; 0.491803; 0.737705; 0.983607; 1',
  keySplines: '0 0 1 1; 0 0 1 1; 0 0 1 1; 0 0 1 1; 0 0 1 1',
} as const

const SUN_BLOB =
  'M0,-73C40.317,-73,73,-40.317,73,0C73,40.317,40.317,73,0,73C-40.317,73,-73,40.317,-73,0C-73,-40.317,-40.317,-73,0,-73Z'

export function LiquidSun({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sun-fire" gradientUnits="userSpaceOnUse" spreadMethod="pad" x1="-62.5" y1="-68.5" x2="48.75" y2="53.5">
          <stop offset="0.2%" stopColor="#fffb00" />
          <stop offset="52.4%" stopColor="#ff8400" />
          <stop offset="100%" stopColor="#ff0d00" />
        </linearGradient>
        <filter id="sun-glow" filterUnits="userSpaceOnUse" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="15" in="SourceGraphic" />
        </filter>
        <filter id="sun-invert">
          <feComponentTransfer in="SourceGraphic">
            <feFuncA type="table" tableValues="1 0" />
          </feComponentTransfer>
        </filter>
        <mask id="sun-clip" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="-10000" y="-10000" width="20000" height="20000" style={{ maskType: 'alpha' }}>
          <g filter="url(#sun-invert)">
            <rect x="0" y="0" width="400" height="400" fill="#ffffff" opacity="0" />
            <g transform="matrix(1.1,0,0,1.1,289.1,223.1)">
              <g transform="matrix(1,0,0,1,-81,-21)">
                <path d={SUN_BLOB} fill="#5b71db" />
              </g>
            </g>
          </g>
        </mask>
        <filter id="sun-white-a">
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
        </filter>
        <mask id="sun-inner" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="-10000" y="-10000" width="20000" height="20000" style={{ maskType: 'alpha' }}>
          <g filter="url(#sun-white-a)" transform="matrix(1.1,0,0,1.1,289.1,223.1)">
            <g transform="matrix(1,0,0,1,-81,-21)">
              <path d={SUN_BLOB} fill="#5b71db" />
            </g>
          </g>
        </mask>
        <filter id="sun-white-b">
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
        </filter>
        <mask id="sun-ring-a" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="-10000" y="-10000" width="20000" height="20000" style={{ maskType: 'alpha' }}>
          <g transform="matrix(0.909,0,0,0.909,-262.818,-202.818)">
            <g filter="url(#sun-white-b)" transform="matrix(1.1,0,0,1.1,289.1,223.1)">
              <g transform="matrix(1,0,0,1,-81,-21)">
                <ellipse cx="0" cy="0" rx="73" ry="73" stroke="#c8c8c8" strokeWidth="6" />
              </g>
            </g>
          </g>
        </mask>
        <filter id="sun-white-c">
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
        </filter>
        <mask id="sun-ring-b" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="-10000" y="-10000" width="20000" height="20000" style={{ maskType: 'alpha' }}>
          <g transform="matrix(0.909,0,0,0.909,-262.818,-202.818)">
            <g filter="url(#sun-white-c)" transform="matrix(1.1,0,0,1.1,289.1,223.1)">
              <g transform="matrix(1,0,0,1,-81,-21)">
                <ellipse cx="0" cy="0" rx="73" ry="73" stroke="#cfc3bc" strokeWidth="6" />
              </g>
            </g>
          </g>
        </mask>
      </defs>

      {/* Blob de fuego que orbita y asoma fuera del disco (las "llamaradas") */}
      <g mask="url(#sun-clip)">
        <g transform="translate(199.875,126.938)">
          <animateTransform {...ORBIT} />
          <g transform="translate(81,21)">
            <g transform="matrix(1,0,0,1,-81,-21)">
              <ellipse cx="0" cy="0" rx="73" ry="73" fill="url(#sun-fire)" />
            </g>
          </g>
        </g>
      </g>

      {/* El mismo blob, difuminado, visible solo dentro del disco (brillo interior) */}
      <g mask="url(#sun-inner)">
        <g transform="translate(199.875,126.938)">
          <animateTransform {...ORBIT} />
          <g filter="url(#sun-glow)" transform="translate(81,21)">
            <g transform="matrix(1,0,0,1,-81,-21)">
              <ellipse cx="0" cy="0" rx="73" ry="73" fill="url(#sun-fire)" />
            </g>
          </g>
        </g>
      </g>

      {/* Disco base del sol */}
      <g opacity="0.4" transform="matrix(1.1,0,0,1.1,289.1,223.1)">
        <g transform="matrix(1,0,0,1,-81,-21)">
          <ellipse cx="0" cy="0" rx="73" ry="73" fill="#efc88a" />
        </g>
      </g>

      {/* Realces blancos del borde */}
      <g mask="url(#sun-ring-a)" transform="matrix(1.1,0,0,1.1,289.1,223.1)">
        <g transform="matrix(1,0,0,1,-81,-21)">
          <ellipse cx="0" cy="0" rx="73" ry="73" fill="#ffffff" />
        </g>
      </g>
      <g mask="url(#sun-ring-b)" transform="matrix(1.1,0,0,1.1,289.1,223.1)">
        <g transform="matrix(1,0,0,1,-81,-21)">
          <ellipse cx="0" cy="0" rx="73" ry="73" fill="#ffffff" />
        </g>
      </g>
    </svg>
  )
}
