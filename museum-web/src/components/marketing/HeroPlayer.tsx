'use client';

import { Player } from '@remotion/player';
import { HeroComposition } from '@/remotion/HeroComposition';

const DURATION_IN_FRAMES = 300;
const FPS = 30;

export default function HeroPlayer() {
  return (
    <div className="relative w-full" style={{ maxWidth: 500, aspectRatio: '3 / 4' }}>
      <Player
        component={HeroComposition}
        durationInFrames={DURATION_IN_FRAMES}
        fps={FPS}
        compositionWidth={500}
        compositionHeight={660}
        autoPlay
        loop
        controls={false}
        clickToPlay={false}
        initiallyMuted
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
