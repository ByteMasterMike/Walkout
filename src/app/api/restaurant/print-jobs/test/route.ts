import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/restaurant/print-jobs/test
 * Queues a minimal CloudPRNT XML job so staff can verify polling + paper.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.restaurantId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<CloudPRNT>
  <ContentType>application/vnd.star.starprnt</ContentType>
  <Content>
    <Align>Center</Align>
    <TextEmphasized>WalkOut test print</TextEmphasized>
    <FeedLine>2</FeedLine>
    <Text>If you can read this, CloudPRNT is wired.</Text>
    <FeedLine>3</FeedLine>
  </Content>
</CloudPRNT>`;

  const job = await prisma.printJob.create({
    data: {
      restaurantId: session.user.restaurantId,
      type: 'CASH_RECEIPT',
      status: 'QUEUED',
      content: Buffer.from(xml, 'utf8'),
      metadata: { test: true },
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, job });
}
