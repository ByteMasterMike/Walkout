import { Body, Container, Head, Html, Link, Section, Text } from '@react-email/components';

export type ThreeDsEmailProps = {
  restaurantName: string;
  actionUrl: string;
};

export default function ThreeDsEmail({ restaurantName, actionUrl }: ThreeDsEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'system-ui,sans-serif', padding: '24px' }}>
        <Container style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px' }}>
          <Text style={{ fontWeight: 600 }}>Verify your card</Text>
          <Text>
            Your bank needs a quick verification to keep your tab open at {restaurantName}.
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
              Complete verification
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
