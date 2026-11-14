import { InfraiError, infrai } from "./infrai.js";
import { handleCreatorDeliveryVerification } from "./creator_delivery_service.js";

export async function postCreatorDeliveryVerification(req: Request): Promise<Response> {
  const body = await req.json();

  try {
    const result = await handleCreatorDeliveryVerification(body, {
      resend: (id: string) => infrai.sms.resend(id),
      events: (id: string) => infrai.sms.events(id)
    });
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof InfraiError) {
      return Response.json(
        {
          error: error.message,
          code: error.code
        },
        { status: error.status >= 400 && error.status < 500 ? error.status : 502 }
      );
    }

    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ error: "Unknown error" }, { status: 400 });
  }
}
