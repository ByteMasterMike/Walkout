import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import ReceiptEmail from '../ReceiptEmail';

describe('ReceiptEmail', () => {
  it('renders item lines and total (§18.7 single charge)', async () => {
    const html = await render(
      <ReceiptEmail
        restaurantName="Test Bistro"
        tableNumber="12"
        lines={[
          { label: '1× Burger', amount: '$14.00' },
          { label: 'Subtotal', amount: '$14.00' },
          { label: 'Tax', amount: '$0.84' },
          { label: 'WalkOut service fee', amount: '$0.07' },
          { label: 'Tip', amount: '$2.80' },
        ]}
        totalCharged="$17.71"
      />,
    );

    expect(html).toContain('Test Bistro');
    expect(html).toMatch(/Table[\s\S]*?12/);
    expect(html).toContain('Tip');
    expect(html).toContain('$17.71');
    expect(html).toContain('Total charged');
  });
});
