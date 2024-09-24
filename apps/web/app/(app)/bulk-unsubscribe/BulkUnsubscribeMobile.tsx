"use client";

import type React from "react";
import Link from "next/link";
import {
  useUnsubscribe,
  useApproveButton,
  useArchiveAll,
} from "@/app/(app)/bulk-unsubscribe/hooks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import { usePostHog } from "posthog-js/react";
import type { RowProps } from "@/app/(app)/bulk-unsubscribe/types";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { NewsletterStatus } from "@prisma/client";
import {
  ArchiveIcon,
  BadgeCheckIcon,
  MailMinusIcon,
  MoreVerticalIcon,
} from "lucide-react";
import { cleanUnsubscribeLink } from "@/utils/parse/parseHtml.client";
import { Badge } from "@/components/ui/badge";

export function BulkUnsubscribeMobile({
  tableRows,
}: {
  tableRows?: React.ReactNode;
}) {
  return <div className="mx-2 mt-2 grid gap-2">{tableRows}</div>;
}

export function BulkUnsubscribeRowMobile({
  item,
  refetchPremium,
  mutate,
  hasUnsubscribeAccess,
  onOpenNewsletter,
}: RowProps) {
  const readPercentage = (item.readEmails / item.value) * 100;
  const archivedEmails = item.value - item.inboxEmails;
  const archivedPercentage = (archivedEmails / item.value) * 100;

  const name = extractNameFromEmail(item.name);
  const email = extractEmailAddress(item.name);

  const posthog = usePostHog();

  const { approveLoading, onApprove } = useApproveButton({
    item,
    mutate,
    posthog,
  });
  const { unsubscribeLoading, onUnsubscribe } = useUnsubscribe({
    item,
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
  });
  const { archiveAllLoading, onArchiveAll } = useArchiveAll({
    item,
    posthog,
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="truncate">{name}</CardTitle>
        <CardDescription className="truncate">{email}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2 text-nowrap">
          <Badge variant="outline" className="justify-center">
            {item.value} emails
          </Badge>
          <Badge
            variant={badgeVariant(readPercentage, 50, 75)}
            className="justify-center"
          >
            {readPercentage.toFixed(0)}% read
          </Badge>
          <Badge
            variant={badgeVariant(archivedPercentage, 50, 75)}
            className="justify-center"
          >
            {archivedPercentage.toFixed(0)}% archived
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant={
              item.status === NewsletterStatus.APPROVED ? "green" : "secondary"
            }
            onClick={onApprove}
            disabled={!hasUnsubscribeAccess}
          >
            {approveLoading ? (
              <ButtonLoader />
            ) : (
              <BadgeCheckIcon className="mr-2 size-4" />
            )}
            Keep
          </Button>

          <Button
            size="sm"
            variant={
              item.status === NewsletterStatus.UNSUBSCRIBED ? "red" : "default"
            }
            asChild={!!item.lastUnsubscribeLink}
          >
            <Link
              href={
                hasUnsubscribeAccess && item.lastUnsubscribeLink
                  ? cleanUnsubscribeLink(item.lastUnsubscribeLink) || "#"
                  : "#"
              }
              target="_blank"
              onClick={onUnsubscribe}
              rel="noreferrer"
            >
              <span className="flex items-center gap-1.5">
                {unsubscribeLoading ? (
                  <ButtonLoader />
                ) : (
                  <MailMinusIcon className="size-4" />
                )}
                Unsubscribe
              </span>
            </Link>
          </Button>

          <Button size="sm" variant="secondary" onClick={onArchiveAll}>
            {archiveAllLoading ? (
              <ButtonLoader />
            ) : (
              <ArchiveIcon className="mr-2 size-4" />
            )}
            Archive All
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => onOpenNewsletter(item)}
          >
            <MoreVerticalIcon className="mr-2 size-4" />
            More
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function badgeVariant(
  value: number,
  cutoffBad: number,
  cutoffGood: number,
): "green" | "red" | "outline" {
  if (value < cutoffBad) return "red";
  if (value > cutoffGood) return "green";
  return "outline";
}
