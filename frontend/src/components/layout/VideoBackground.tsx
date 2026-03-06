import { useRef, useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";

export function VideoBackground() {
  const { theme } = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.load();
    video.play().catch(() => {});
  }, [theme]);

  return (
    <div className="video-bg">
      <video
        ref={videoRef}
        key={theme}
        autoPlay
        loop
        muted
        playsInline
        className="video-bg__video"
      >
        <source
          src={theme === "dark" ? "/video/Black.mp4" : "/video/White.mp4"}
          type="video/mp4"
        />
      </video>
      <div className="video-bg__overlay" />
    </div>
  );
}
