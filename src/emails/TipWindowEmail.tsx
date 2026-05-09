import { Body, Container, Head, Html, Link, Section, Text } from '@react-email/components';

export type TipWindowEmailProps = {
  restaurantName: string;
  tipUrl: string;
};

export default function TipWindowEmail({ restaurantName, tipUrl }: TipWindowEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'system-ui,sans-serif', backgroundColor: '#fafafa', padding: '24px' }}>
        <Container style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px' }}>
          <Text style={{ fontSize: '18px', fontWeight: 600 }}>{restaurantName}</Text>
          <Text>Your meal is ready to close out. Pick a tip — a 20% tip applies automatically if you don&apos;t choose within 15 minutes.</Text>
          <Section style={{ marginTop: '16px' }}>
            <Link
              href={tipUrl}
              style={{
                backgroundColor: '#000',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Choose tip &amp; pay
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
