import { Body, Container, Head, Html, Section, Text } from '@react-email/components';

export type ReceiptLine = { label: string; amount: string };

export type ReceiptEmailProps = {
  restaurantName: string;
  tableNumber: string;
  lines: ReceiptLine[];
  totalCharged: string;
  cardSummary?: string;
};

/** Itemised receipt — tip on same charge line as meal (§18.7). */
export default function ReceiptEmail({
  restaurantName,
  tableNumber,
  lines,
  totalCharged,
  cardSummary,
}: ReceiptEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'system-ui,sans-serif', backgroundColor: '#fafafa', padding: '24px' }}>
        <Container style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', maxWidth: '420px' }}>
          <Text style={{ fontSize: '18px', fontWeight: 700, textAlign: 'center' }}>{restaurantName}</Text>
          <Text style={{ textAlign: 'center', color: '#666', fontSize: '14px' }}>Table {tableNumber}</Text>
          <Section style={{ marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
            {lines.map((l, i) => (
              <Text key={i} style={{ margin: '6px 0', fontSize: '14px' }}>
                <span>{l.label}</span>
                <span style={{ float: 'right' }}>{l.amount}</span>
              </Text>
            ))}
          </Section>
          <Section style={{ marginTop: '16px', borderTop: '2px solid #000', paddingTop: '12px' }}>
            <Text style={{ fontWeight: 700, fontSize: '16px' }}>
              Total charged
              <span style={{ float: 'right' }}>{totalCharged}</span>
            </Text>
          </Section>
          {cardSummary ? (
            <Text style={{ color: '#666', fontSize: '13px', marginTop: '16px' }}>{cardSummary}</Text>
          ) : null}
          <Text style={{ color: '#999', fontSize: '12px', marginTop: '24px' }}>Thank you for dining with us.</Text>
        </Container>
      </Body>
    </Html>
  );
}
