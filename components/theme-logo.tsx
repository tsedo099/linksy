import Image from "next/image";

type ThemeLogoProps = {
  alt: string;
  className?: string;
  darkSrc: string;
  height: number;
  lightSrc: string;
  priority?: boolean;
  width: number;
};

export function ThemeLogo({
  alt,
  className,
  darkSrc,
  height,
  lightSrc,
  priority = false,
  width,
}: ThemeLogoProps) {
  const imageClassName = className ? `${className} theme-logo-asset` : "theme-logo-asset";

  return (
    <>
      <span className="theme-logo-slot theme-logo-slot--dark">
        <Image
          src={darkSrc}
          alt={alt}
          width={width}
          height={height}
          className={`${imageClassName} theme-logo-asset--dark`}
          priority={priority}
          unoptimized
        />
      </span>
      <span className="theme-logo-slot theme-logo-slot--light">
        <Image
          src={lightSrc}
          alt={alt}
          width={width}
          height={height}
          className={`${imageClassName} theme-logo-asset--light`}
          priority={priority}
          unoptimized
        />
      </span>
    </>
  );
}
