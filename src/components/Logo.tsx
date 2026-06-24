import Svg, { Path } from 'react-native-svg';

interface LogoProps {
  size?: number;
  /** 'light' = teal fills (for white/light bg); 'dark' = white fills (for teal bg) */
  variant?: 'light' | 'dark';
}

export default function Logo({ size = 80, variant = 'light' }: LogoProps) {
  const p = variant === 'dark' ? '#ffffff' : '#0F6E6E';
  const a = variant === 'dark' ? '#a8d8d0' : '#1A9A9A';

  // Icon paths use A3.svg coordinates; viewBox crops to icon bounds (x=296–468, y=0–175)
  return (
    <Svg width={size} height={size} viewBox="296 0 172 175">
      <Path fill={a} d="M370.73,76.56c-15.61,18.17-35.26,52.66-39,98.08H311.58C322.26,134.39,352.71,96.42,370.73,76.56z"/>
      <Path fill={p} d="M338.16,59a18.91,18.91,0,1,1,21-18.8A19,19,0,0,1,338.16,59ZM332.8,0h-9a27.18,27.18,0,0,0-27.18,27.18v145a2.58,2.58,0,0,0,2.58,2.58h0c10.35-29.88,53.51-134.16,159-160a56.66,56.66,0,0,1,10.06-1.44V4.73A4.73,4.73,0,0,0,463.52,0Z"/>
      <Path fill={a} d="M465.83,13.47a47.13,47.13,0,0,0-11.34,2.6l-1.57.56c-76,32.76-76.55,129.44-72,158.13h60.16a27.18,27.18,0,0,0,27.18-27.18V13.31C467.44,13.34,466.63,13.39,465.83,13.47z"/>
    </Svg>
  );
}
