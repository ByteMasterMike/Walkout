import { Body, Container, Head, Html, Link, Section, Text } from '@react-email/components';

export type StaffInviteEmailProps = {
  restaurantName: string;
  inviteeName: string;
  roleLabel: string;
  inviteUrl: string;
};

export default function StaffInviteEmail({
  restaurantName,
  inviteeName,
  roleLabel,
  inviteUrl,
}: StaffInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'system-ui,sans-serif', padding: '24px' }}>
        <Container style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px' }}>
          <Text>Hi {inviteeName},</Text>
          <Text>
            {restaurantName} has invited you to join WalkOut as {roleLabel}.
          </Text>
          <Section style={{ marginTop: '16px' }}>
            <Link
              href={inviteUrl}
              style={{
                backgroundColor: '#000',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Accept invite
            </Link>
          </Section>
          <Text style={{ color: '#999', fontSize: '12px', marginTop: '24px' }}>Link expires in 72 hours.</Text>
        </Container>
      </Body>
    </Html>
  );
}
