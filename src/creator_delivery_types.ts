import { z } from "zod";

export const assetIngestionSchema = z.object({
  assetId: z.string().min(1),
  sourceUrl: z.string().url(),
  creatorPhone: z.string().min(6),
  verificationMessageId: z.string().min(1)
});

export const processingJobSchema = z.object({
  jobId: z.string().min(1),
  assetId: z.string().min(1),
  status: z.enum(["queued", "processing", "ready"]),
  stalledMinutes: z.number().int().nonnegative()
});

export const creatorDeliveryRequestSchema = z.object({
  ingestion: assetIngestionSchema,
  job: processingJobSchema
});

export type AssetIngestion = z.infer<typeof assetIngestionSchema>;
export type ProcessingJob = z.infer<typeof processingJobSchema>;
export type CreatorDeliveryRequest = z.infer<typeof creatorDeliveryRequestSchema>;

export type DeliveryState = "sent" | "delivered" | "pending";

export type CreatorDeliveryResult = {
  assetId: string;
  jobId: string;
  action: "resend_verification_code" | "no_action";
  resentMessageId: string | null;
  deliveryState: DeliveryState;
};
