import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App smoke', () => {
  it('renders splash screen entry point', async () => {
    render(<App />);
    expect(await screen.findByText(/Inizia Partita/i)).toBeInTheDocument();
  });
});
