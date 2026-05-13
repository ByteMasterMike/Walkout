import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default:
          'rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-amber-light active:translate-y-px',
        destructive:
          'rounded-full border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15',
        outline:
          'rounded-full border border-border bg-transparent text-foreground hover:border-primary hover:text-primary',
        secondary:
          'rounded-full border border-border bg-scrim-3 text-foreground shadow-sm hover:border-primary/50 hover:bg-scrim-2',
        ghost:
          'rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        link:
          'rounded-full text-primary underline-offset-4 hover:underline',
        success:
          'rounded-full border border-moss/40 bg-moss/15 text-moss hover:bg-moss/25',
      },
      size: {
        default: 'h-11 px-6 py-2 text-sm',
        sm:      'h-9 rounded-full px-4 text-xs',
        lg:      'h-12 rounded-full px-8 text-base',
        icon:    'h-10 w-10 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size:    'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
