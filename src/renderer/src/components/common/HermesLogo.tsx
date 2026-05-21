import { APP_BRAND } from "../../../../shared/branding";
import logo from "../../assets/brand/activi-logo.jpg";

function HermesLogo({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <img
      src={logo}
      width={size}
      height={size}
      className="brand-logo-image"
      aria-label={APP_BRAND.productName}
      alt={APP_BRAND.productName}
    />
  );
}

export default HermesLogo;
