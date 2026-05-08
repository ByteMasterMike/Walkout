import { Body, Container, Head, Html, Link, Section, Text } from '@react-email/components';

export type CaptureFailedEmailProps = {
  restaurantName: string;
  amount: string;
  payUrl: string;
};

export default function CaptureFailedEmail({ restaurantName, amount, payUrl }: CaptureFailedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'system-ui,sans-serif', padding: '24px' }}>
        <Container style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px' }}>
          <Text style={{ fontWeight: 600 }}>Payment didn&apos;t go through</Text>
          <Text>
            We couldn&apos;t charge {amount} at {restaurantName}. Complete payment here:
          </Text>
          <Section style={{ marginTop: '16px' }}>
            <Link
              href={payUrl}
              style={{
                backgroundColor: '#000',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Pay now
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
