interface LogoProps {
  variant?: 'fixed' | 'inline';
}

export function Logo({ variant = 'fixed' }: LogoProps) {
  return (
    <div className={variant === 'fixed' ? 'logo' : 'logo logo-inline'}>
      <span className="logo-accent">ENVIRO</span>
      <span className="logo-rest">VOICE</span>
    </div>
  );
}
