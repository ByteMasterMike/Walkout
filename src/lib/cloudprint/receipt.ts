import Decimal from 'decimal.js';

/** Escape text for Star CloudPRNT XML content — prevents injection / malformed XML. */
export function xmlEscape(s: string): string {
  // PRD §16.3: defense-in-depth against ESC/POS injection through stored menu names
  // eslint-disable-next-line no-control-regex
  const cleaned = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export type ReceiptRestaurant = {
  name: string;
  taxLabel: string;
  /** Decimal rate e.g. 0.06 */
  taxRate: Decimal;
};

export type ReceiptParticipant = {
  tableNumber: string;
};

export type ReceiptOrderLine = {
  quantity: number;
  menuItemName: string;
  unitPrice: Decimal;
  taxAmount: Decimal;
  status: string;
};

/**
 * CloudPRNT XML for a cash payment receipt (PRD §16.3).
 * Includes `<PeripheralChannel>1</PeripheralChannel>` to open the cash drawer.
 */
export function generateCashReceiptXml(
  restaurant: ReceiptRestaurant,
  participant: ReceiptParticipant,
  orders: ReceiptOrderLine[],
): string {
  const active = orders.filter((o) => o.status !== 'CANCELLED');
  const subtotal = active.reduce(
    (s, o) => s.plus(o.unitPrice.times(o.quantity)),
    new Decimal(0),
  );
  const tax = active.reduce((s, o) => s.plus(o.taxAmount), new Decimal(0));
  const total = subtotal.plus(tax);
  const taxPct = restaurant.taxRate.times(100).toFixed(0);

  const lines = active
    .map((o) => {
      const lineTotal = o.unitPrice.times(o.quantity).toFixed(2);
      return `
    <Text>${o.quantity}x ${xmlEscape(o.menuItemName)}</Text>
    <Align>Right</Align>
    <Text>$${lineTotal}</Text>
    <Align>Left</Align>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<CloudPRNT>
  <ContentType>application/vnd.star.starprnt</ContentType>
  <Content>
    <Align>Center</Align>
    <TextEmphasized>${xmlEscape(restaurant.name)}</TextEmphasized>
    <FeedLine>1</FeedLine>
    <Text>Table ${xmlEscape(participant.tableNumber)}</Text>
    <Text>${xmlEscape(new Date().toLocaleString('en-US'))}</Text>
    <FeedLine>1</FeedLine>
    <Align>Left</Align>
    ${lines}
    <FeedLine>1</FeedLine>
    <Text>Subtotal: $${subtotal.toFixed(2)}</Text>
    <Text>${xmlEscape(restaurant.taxLabel)} (${taxPct}%): $${tax.toFixed(2)}</Text>
    <TextEmphasized>TOTAL: $${total.toFixed(2)}</TextEmphasized>
    <Text>PAYMENT: CASH</Text>
    <FeedLine>1</FeedLine>
    <Text>Thank you!</Text>
    <FeedLine>3</FeedLine>
    <PeripheralChannel>1</PeripheralChannel>
  </Content>
</CloudPRNT>`;
}
