import { useEffect } from "react";
import { APP_BRAND } from "../../../../shared/branding";
import logo from "../../assets/brand/activi-logo.jpg";
import splashVideo from "../../assets/brand/activi-splash.mp4";

interface SplashScreenProps {
  onFinished: () => void;
}

function SplashScreen({ onFinished }: SplashScreenProps): React.JSX.Element {
  useEffect(() => {
    onFinished();
  }, [onFinished]);

  return (
    <div className="splash-screen">
      <video
        className="splash-video"
        src={splashVideo}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      <div className="splash-video-overlay" />
      <div className="splash-wordmark">
        <img
          className="splash-logo-image"
          src={logo}
          alt={APP_BRAND.productName}
        />
        <div>
          <div className="splash-title">{APP_BRAND.name}</div>
          <div className="splash-subtitle">{APP_BRAND.description}</div>
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;
