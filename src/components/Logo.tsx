import Svg, { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

interface LogoProps {
  size?: number;
}

export default function Logo({ size = 80 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <ClipPath id="iconClip">
          <Rect width="200" height="200" rx="46" ry="46"/>
        </ClipPath>

        {/* Background: warm peach bottom → light teal-green top */}
        <LinearGradient id="bgGrad" x1="0.3" y1="0" x2="0.7" y2="1">
          <Stop offset="0%"   stopColor="#8ed2be"/>
          <Stop offset="100%" stopColor="#f5b896"/>
        </LinearGradient>

        {/* Left dark teal band */}
        <LinearGradient id="leftGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor="#0c6e6e"/>
          <Stop offset="58%"  stopColor="#0c6e6e"/>
          <Stop offset="100%" stopColor="#0c6e6e" stopOpacity="0"/>
        </LinearGradient>

        {/* Right lighter teal band */}
        <LinearGradient id="rightGrad" x1="0.1" y1="0" x2="0.9" y2="1">
          <Stop offset="0%"   stopColor="#60c8b0"/>
          <Stop offset="100%" stopColor="#138888"/>
        </LinearGradient>
      </Defs>

      <G clipPath="url(#iconClip)">
        {/* Background */}
        <Rect width="200" height="200" fill="url(#bgGrad)"/>

        {/* Left dark teal region */}
        <Path
          d="M 0,0 L 74,0 C 76,60 100,90 96,120 C 92,150 60,168 54,200 L 0,200 Z"
          fill="url(#leftGrad)"
        />

        {/* Right lighter teal region */}
        <Path
          d="M 106,0 L 200,0 L 200,200 L 86,200 C 80,168 110,150 116,120 C 122,90 106,60 106,0 Z"
          fill="url(#rightGrad)"
        />

        {/* Warm cream winding path */}
        <Path
          d="M 74,0 C 76,60 100,90 96,120 C 92,150 60,168 54,200 L 86,200 C 80,168 110,150 116,120 C 122,90 106,60 106,0 Z"
          fill="#f2e5d6"
        />
      </G>
    </Svg>
  );
}
