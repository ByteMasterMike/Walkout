import { Body, Container, Head, Html, Link, Section, Text } from '@react-email/components';

export type ReauthFailedEmailProps = {
  restaurantName: string;
  actionUrl: string;
};

export default function ReauthFailedEmail({ restaurantName, actionUrl }: ReauthFailedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'system-ui,sans-serif', padding: '24px' }}>
        <Container style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px' }}>
          <Text style={{ fontWeight: 600 }}>Update your payment method</Text>
          <Text>
            Your card authorization at {restaurantName} expired before we could close your tab. Add a new card to
            continue.
          </Text>
          <Section style={{ marginTop: '16px' }}>
            <Link
              href={actionUrl}
              style={{
                backgroundColor: '#000',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Update card
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
