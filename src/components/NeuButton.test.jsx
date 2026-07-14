import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NeuButton } from './NeuButton';

describe('NeuButton', () => {
  it('renders children correctly', () => {
    render(<NeuButton>Click me</NeuButton>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('applies default variant classes', () => {
    render(<NeuButton>Default</NeuButton>);
    const button = screen.getByRole('button', { name: /default/i });
    expect(button).toHaveClass('text-neutral-400');
  });

  it('applies primary variant classes', () => {
    render(<NeuButton variant="primary">Primary</NeuButton>);
    const button = screen.getByRole('button', { name: /primary/i });
    expect(button).toHaveClass('text-red-500');
  });

  it('triggers onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<NeuButton onClick={handleClick}>Clickable</NeuButton>);
    
    const button = screen.getByRole('button', { name: /clickable/i });
    fireEvent.click(button);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    const handleClick = vi.fn();
    render(<NeuButton disabled onClick={handleClick}>Disabled</NeuButton>);
    
    const button = screen.getByRole('button', { name: /disabled/i });
    expect(button).toBeDisabled();
    
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
