import { creatorDeliveryRequestSchema, type CreatorDeliveryRequest, type CreatorDeliveryResult, type DeliveryState } from "./creator_delivery_types.js";

export type SmsGateway = {
  resend(id: string): Promise<{ message_id: string }>;
  events(id: string): Promise<unknown[]>;
};

function pickDeliveryState(events: unknown[]): DeliveryState {
  const text = JSON.stringify(events).toLowerCase();
  if (text.includes("delivered")) return "delivered";
  if (text.includes("sent")) return "sent";
  return "pending";
}

function shouldResend(request: CreatorDeliveryRequest): boolean {
  return request.job.status === "ready" && request.job.stalledMinutes >= 10;
}

export async function handleCreatorDeliveryVerification(
  input: unknown,
  sms: SmsGateway
): Promise<CreatorDeliveryResult> {
  const request = creatorDeliveryRequestSchema.parse(input);

  if (!shouldResend(request)) {
    const existingEvents = await sms.events(request.ingestion.verificationMessageId);
    return {
      assetId: request.ingestion.assetId,
      jobId: request.job.jobId,
      action: "no_action",
      resentMessageId: null,
      deliveryState: pickDeliveryState(existingEvents)
    };
  }

  const resent = await sms.resend(request.ingestion.verificationMessageId);
  const events = await sms.events(resent.message_id);

  return {
    assetId: request.ingestion.assetId,
    jobId: request.job.jobId,
    action: "resend_verification_code",
    resentMessageId: resent.message_id,
    deliveryState: pickDeliveryState(events)
  };
}
