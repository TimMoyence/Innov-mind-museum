export default function LandingSvgFilters() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <defs>
        <filter id="liquid-glass-filter" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.01 0.01"
            numOctaves={2}
            seed={42}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation={3} result="blurred" />
          <feSpecularLighting
            in="blurred"
            surfaceScale={3}
            specularConstant={0.8}
            specularExponent={80}
            lightingColor="white"
            result="specLight"
          >
            <fePointLight x={-100} y={-100} z={200} />
          </feSpecularLighting>
          <feComposite
            in="specLight"
            operator="arithmetic"
            k1={0}
            k2={1}
            k3={1}
            k4={0}
            result="litImage"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurred"
            scale={8}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
